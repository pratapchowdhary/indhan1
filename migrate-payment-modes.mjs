import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const pool = mysql.createPool(process.env.DATABASE_URL);

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("Upgrading payment modes in cash_collections...");

    // 1. Modify the payment_mode enum to include digital and keep backward compat
    await conn.execute(`
      ALTER TABLE cash_collections
      MODIFY COLUMN payment_mode ENUM('cash','card','online','credit','digital') NOT NULL DEFAULT 'cash'
    `);
    console.log("✓ payment_mode enum extended to include 'digital'");

    // 2. Add digital_sub_type column
    await conn.execute(`
      ALTER TABLE cash_collections
      ADD COLUMN IF NOT EXISTS digital_sub_type VARCHAR(20) NULL
        COMMENT 'upi | phonepe | card | bank_transfer | bhim — only set when payment_mode = digital'
    `);
    console.log("✓ digital_sub_type column added");

    // 3. Migrate existing 'card' and 'online' rows to digital with sub-type
    const [cardRows] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM cash_collections WHERE payment_mode = 'card'`
    );
    const cardCount = cardRows[0].cnt;
    if (cardCount > 0) {
      await conn.execute(`
        UPDATE cash_collections
        SET payment_mode = 'digital', digital_sub_type = 'card'
        WHERE payment_mode = 'card'
      `);
      console.log(`✓ Migrated ${cardCount} 'card' rows → digital/card`);
    }

    const [onlineRows] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM cash_collections WHERE payment_mode = 'online'`
    );
    const onlineCount = onlineRows[0].cnt;
    if (onlineCount > 0) {
      await conn.execute(`
        UPDATE cash_collections
        SET payment_mode = 'digital', digital_sub_type = 'upi'
        WHERE payment_mode = 'online'
      `);
      console.log(`✓ Migrated ${onlineCount} 'online' rows → digital/upi`);
    }

    // 4. Now tighten the enum to final set (remove old card/online values)
    await conn.execute(`
      ALTER TABLE cash_collections
      MODIFY COLUMN payment_mode ENUM('cash','digital','credit') NOT NULL DEFAULT 'cash'
    `);
    console.log("✓ payment_mode enum finalised: cash | digital | credit");

    // 5. Update schema.ts enum reference (done separately in code)
    console.log("\n✅ Migration complete. Summary:");
    const [summary] = await conn.execute(`
      SELECT payment_mode, digital_sub_type, COUNT(*) as cnt
      FROM cash_collections
      GROUP BY payment_mode, digital_sub_type
      ORDER BY payment_mode, digital_sub_type
    `);
    console.table(summary);

  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
