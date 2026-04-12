import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

console.log("Running cash handover & deposit voucher migration...");

try {
  // Create cash_deposit_vouchers table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS \`cash_deposit_vouchers\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`voucher_number\` varchar(30) NOT NULL,
      \`voucher_date\` varchar(10) NOT NULL,
      \`total_cash_collected\` decimal(14,2) NOT NULL,
      \`total_cash_expenses\` decimal(14,2) NOT NULL DEFAULT '0',
      \`float_retained\` decimal(14,2) NOT NULL DEFAULT '0',
      \`deposit_amount\` decimal(14,2) NOT NULL,
      \`bank_account\` varchar(200),
      \`deposit_instructions\` text,
      \`status\` enum('draft','finalised','deposited','reconciled') NOT NULL DEFAULT 'draft',
      \`bank_transaction_id\` int,
      \`reconciledAt\` timestamp NULL,
      \`reconciled_by\` varchar(100),
      \`generated_by\` varchar(100),
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`cash_deposit_vouchers_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`cash_deposit_vouchers_voucher_number_unique\` UNIQUE(\`voucher_number\`)
    )
  `);
  console.log("✓ cash_deposit_vouchers table created");

  // Create cash_handover_sessions table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS \`cash_handover_sessions\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`handover_date\` varchar(10) NOT NULL,
      \`nozzle_id\` int NOT NULL,
      \`cash_collected\` decimal(14,2) NOT NULL DEFAULT '0',
      \`cash_expenses\` decimal(14,2) NOT NULL DEFAULT '0',
      \`net_cash\` decimal(14,2) NOT NULL DEFAULT '0',
      \`actual_amount\` decimal(14,2),
      \`variance\` decimal(14,2),
      \`confirmedAt\` timestamp NULL,
      \`confirmed_by\` varchar(100),
      \`deposit_voucher_id\` int,
      \`notes\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`cash_handover_sessions_id\` PRIMARY KEY(\`id\`)
    )
  `);
  console.log("✓ cash_handover_sessions table created");

  // Add nozzle_id to expenses table (nullable — not all expenses are nozzle-linked)
  try {
    await db.execute(`ALTER TABLE \`expenses\` ADD COLUMN \`nozzle_id\` int NULL`);
    console.log("✓ expenses.nozzle_id column added");
  } catch (e) {
    if (e.message.includes("Duplicate column")) {
      console.log("  expenses.nozzle_id already exists, skipping");
    } else throw e;
  }

  // Add payment_source to expenses (bank | cash_nozzle | cash_general)
  try {
    await db.execute(`ALTER TABLE \`expenses\` ADD COLUMN \`payment_source\` enum('bank','cash_nozzle','cash_general') NULL DEFAULT 'bank'`);
    console.log("✓ expenses.payment_source column added");
  } catch (e) {
    if (e.message.includes("Duplicate column")) {
      console.log("  expenses.payment_source already exists, skipping");
    } else throw e;
  }

  console.log("\n✅ Migration complete!");
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
} finally {
  await db.end();
}
