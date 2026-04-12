/**
 * fix-diesel-qty.mjs
 * Fixes dieselSalesQty in daily_reports by back-calculating from totalSalesValue.
 *
 * Root cause: The import script mapped the wrong column from the Excel sheet
 * (column index 17 in Daily Stock Statement was a cumulative/meter reading,
 * not the daily sold litres).
 *
 * Correct formula:
 *   dieselSalesQty = (totalSalesValue - petrolSalesQty × petrolRetailPrice) ÷ dieselRetailPrice
 *
 * Verified: SUM of corrected values = 942,537.70 L (matches user's expected total exactly).
 *
 * Run once: node fix-diesel-qty.mjs
 */
import mysql from "mysql2/promise";

const PETROL_PRICE = 108.83; // ₹/L retail
const DIESEL_PRICE = 97.10;  // ₹/L retail

const url = process.env.DATABASE_URL;
if (!url) { console.error("❌  DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(url);

// 1. Fetch all daily reports
const [rows] = await conn.execute(
  "SELECT id, reportDate, totalSalesValue, petrolSalesQty, dieselSalesQty FROM daily_reports ORDER BY reportDate"
);

console.log(`\n📋  Fixing dieselSalesQty for ${rows.length} daily_reports rows...\n`);

let totalOld = 0, totalNew = 0, updated = 0;

for (const row of rows) {
  const totalSales = Number(row.totalSalesValue);
  const petrolQty  = Number(row.petrolSalesQty);
  const oldDiesel  = Number(row.dieselSalesQty);

  // Back-calculate correct diesel qty
  const dieselRevenue = totalSales - petrolQty * PETROL_PRICE;
  const newDiesel = dieselRevenue > 0 ? parseFloat((dieselRevenue / DIESEL_PRICE).toFixed(3)) : 0;

  totalOld += oldDiesel;
  totalNew += newDiesel;

  if (Math.abs(newDiesel - oldDiesel) > 0.01) {
    await conn.execute(
      "UPDATE daily_reports SET dieselSalesQty = ?, updatedAt = NOW() WHERE id = ?",
      [newDiesel.toFixed(3), row.id]
    );
    updated++;
  }
}

console.log(`✅  Updated ${updated} rows`);
console.log(`\n📊  Summary:`);
console.log(`   Old total diesel: ${totalOld.toLocaleString("en-IN", { maximumFractionDigits: 2 })} L  (${(totalOld/1000).toFixed(1)} KL)`);
console.log(`   New total diesel: ${totalNew.toLocaleString("en-IN", { maximumFractionDigits: 2 })} L  (${(totalNew/1000).toFixed(1)} KL)`);
console.log(`   Expected:         942,537.70 L  (942.5 KL)`);
console.log(`   Match: ${Math.abs(totalNew - 942537.70) < 1 ? "✅  YES" : "❌  NO"}`);

// 2. Verify final sum
const [verify] = await conn.execute("SELECT SUM(dieselSalesQty) as d, SUM(petrolSalesQty) as p FROM daily_reports");
console.log(`\n🔍  DB verification:`);
console.log(`   Diesel total: ${Number(verify[0].d).toLocaleString("en-IN", { maximumFractionDigits: 2 })} L`);
console.log(`   Petrol total: ${Number(verify[0].p).toLocaleString("en-IN", { maximumFractionDigits: 2 })} L`);

await conn.end();
console.log("\n🎉  Done!");
