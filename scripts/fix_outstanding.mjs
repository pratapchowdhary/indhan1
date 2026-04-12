/**
 * Fix customer outstanding balances using exact figures from Excel Receivables-Mar sheet.
 * 
 * From Excel Receivables-Mar (as of 31 Mar 2026):
 * Customer             | Total Sales    | Total Received | Return Paid | Outstanding
 * Battapur             | 3,000          | 3,000          | -           | 0
 * BLG Infra Pvt Ltd    | 47,39,459.70   | 47,39,448      | -           | 11.70
 * Brunda Infra Pvt.Ltd | 20,500.13      | 20,500.13      | -           | 0
 * Dattu                | 2,600          | 2,600          | -           | 0
 * Kodicherla           | 2,987.38       | 2,986          | -           | 1.38
 * Laxmi Infratech      | 2,52,17,824.52 | 3,22,57,126.36 | 87,85,676   | 17,46,374.16
 * Manikanta            | 1,16,11,303.39 | 1,04,84,597    | -           | 11,26,706.39
 * Mendora              | 9,827.80       | 0              | -           | 9,827.80
 * Rockeira Eng Pvt Ltd | 11,345.20      | 0              | -           | 11,345.20
 * Savel                | 74,745.50      | 1,30,090       | 55,345      | 0.50
 * Srinivas Sir         | 70,500         | 2,82,927       | 3,19,427    | 1,07,000
 * Velgatur             | 58,435.69      | 58,250         | -           | 185.69
 */

import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Exact outstanding values from Excel Receivables-Mar sheet
const outstandingData = [
  { name: 'Battapur',                    outstanding: 0 },
  { name: 'BLG Infra Pvt Ltd',           outstanding: 11.70 },
  { name: 'Brunda Infra Pvt.Ltd',        outstanding: 0 },
  { name: 'Dattu',                        outstanding: 0 },
  { name: 'Kodicherla',                   outstanding: 1.38 },
  { name: 'Laxmi Infratech',             outstanding: 1746374.16 },
  { name: 'Manikanta',                   outstanding: 1126706.39 },
  { name: 'Mendora',                      outstanding: 9827.80 },
  { name: 'Rockeira Engineering Pvt Ltd', outstanding: 11345.20 },
  { name: 'Savel',                        outstanding: 0.50 },
  { name: 'Srinivas Sir',                outstanding: 107000 },
  { name: 'Velgatur',                     outstanding: 185.69 },
];

console.log('Updating customer outstanding balances from Excel Receivables-Mar...\n');

for (const { name, outstanding } of outstandingData) {
  const [result] = await conn.execute(
    'UPDATE customers SET outstandingBalance = ? WHERE name = ?',
    [outstanding, name]
  );
  console.log(`✓ ${name}: ₹${outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${result.affectedRows} row updated)`);
}

// Verify
const [rows] = await conn.execute(
  'SELECT name, outstandingBalance, creditLimit FROM customers ORDER BY outstandingBalance DESC'
);
console.log('\nFinal state:');
rows.forEach(r => {
  const outstanding = Number(r.outstandingBalance);
  const limit = Number(r.creditLimit);
  const pct = limit > 0 ? ((outstanding / limit) * 100).toFixed(1) : '0.0';
  console.log(`  ${r.name}: ₹${outstanding.toLocaleString('en-IN')} outstanding / ₹${limit.toLocaleString('en-IN')} limit (${pct}%)`);
});

await conn.end();
console.log('\nDone!');
