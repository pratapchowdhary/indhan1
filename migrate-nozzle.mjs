import mysql from "mysql2/promise";
import { readFileSync } from "fs";

const sql = readFileSync("./drizzle/0005_hot_miek.sql", "utf-8");

// Split on the drizzle statement-breakpoint marker
const statements = sql
  .split("--> statement-breakpoint")
  .map(s => s.trim())
  .filter(Boolean);

const conn = await mysql.createConnection(process.env.DATABASE_URL);

for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    const tableName = stmt.match(/CREATE TABLE `([^`]+)`/)?.[1] ?? "?";
    console.log(`✓ Created table: ${tableName}`);
  } catch (err) {
    if (err.code === "ER_TABLE_EXISTS_ERROR") {
      console.log(`  Already exists, skipping`);
    } else {
      console.error(`✗ Error:`, err.message);
    }
  }
}

// Seed pumps and nozzles
console.log("\nSeeding pumps and nozzles...");

const seeds = [
  // Pumps
  `INSERT IGNORE INTO pumps (pump_number, label, location) VALUES (1, 'Pump 1', 'Island A')`,
  `INSERT IGNORE INTO pumps (pump_number, label, location) VALUES (2, 'Pump 2', 'Island B')`,
];

for (const seed of seeds) {
  try {
    await conn.execute(seed);
  } catch (err) {
    console.error("Seed error:", err.message);
  }
}

// Get pump IDs
const [pump1Rows] = await conn.execute("SELECT id FROM pumps WHERE pump_number = 1");
const [pump2Rows] = await conn.execute("SELECT id FROM pumps WHERE pump_number = 2");
const pump1Id = pump1Rows[0]?.id;
const pump2Id = pump2Rows[0]?.id;

if (pump1Id && pump2Id) {
  const nozzleSeeds = [
    `INSERT IGNORE INTO nozzles (pump_id, nozzle_number, label, fuel_type) VALUES (${pump1Id}, 1, 'Pump 1 – Nozzle 1 (Petrol)', 'petrol')`,
    `INSERT IGNORE INTO nozzles (pump_id, nozzle_number, label, fuel_type) VALUES (${pump1Id}, 2, 'Pump 1 – Nozzle 2 (Diesel)', 'diesel')`,
    `INSERT IGNORE INTO nozzles (pump_id, nozzle_number, label, fuel_type) VALUES (${pump2Id}, 3, 'Pump 2 – Nozzle 3 (Petrol)', 'petrol')`,
    `INSERT IGNORE INTO nozzles (pump_id, nozzle_number, label, fuel_type) VALUES (${pump2Id}, 4, 'Pump 2 – Nozzle 4 (Diesel)', 'diesel')`,
  ];
  for (const seed of nozzleSeeds) {
    try {
      await conn.execute(seed);
    } catch (err) {
      console.error("Nozzle seed error:", err.message);
    }
  }
  console.log("✓ Seeded 2 pumps × 2 nozzles (4 nozzles total)");
}

await conn.end();
console.log("\n✅ Migration complete");
