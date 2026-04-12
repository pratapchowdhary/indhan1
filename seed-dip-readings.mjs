import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables from the running server process
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set. Run with: DATABASE_URL=... node seed-dip-readings.mjs');
  process.exit(1);
}

console.log('Connecting to database...');
const conn = await createConnection(dbUrl);

try {
  // Step 1: Clear existing dip readings
  console.log('Clearing existing dip readings...');
  const [deleteResult] = await conn.execute('DELETE FROM dip_readings');
  console.log(`Deleted ${deleteResult.affectedRows} existing rows`);

  // Step 2: Read the JSON data
  const data = JSON.parse(readFileSync('/home/ubuntu/dip_readings_data.json', 'utf8'));
  console.log(`Inserting ${data.length * 2} dip readings (${data.length} dates × 2 fuel types)...`);

  let inserted = 0;
  for (const rec of data) {
    const date = rec.date;

    // Petrol (MS)
    if (rec.manual_ms !== null && rec.manual_ms !== undefined) {
      await conn.execute(
        `INSERT INTO dip_readings (fuel_type, reading_date, tank_id, dip_litres, dip_stick_reading, reading_time, createdAt, updatedAt)
         VALUES (?, ?, 'T1', ?, ?, '08:00', NOW(), NOW())`,
        ['petrol', date, rec.manual_ms, rec.dip_ms ?? null]
      );
      inserted++;
    }

    // Diesel (HSD)
    if (rec.manual_hsd !== null && rec.manual_hsd !== undefined) {
      await conn.execute(
        `INSERT INTO dip_readings (fuel_type, reading_date, tank_id, dip_litres, dip_stick_reading, reading_time, createdAt, updatedAt)
         VALUES (?, ?, 'T1', ?, ?, '08:00', NOW(), NOW())`,
        ['diesel', date, rec.manual_hsd, rec.dip_hsd ?? null]
      );
      inserted++;
    }
  }

  console.log(`\n✅ Successfully inserted ${inserted} dip readings`);

  // Verify
  const [rows] = await conn.execute('SELECT COUNT(*) as cnt, MIN(reading_date) as min_date, MAX(reading_date) as max_date FROM dip_readings');
  console.log(`\nVerification: ${rows[0].cnt} rows in dip_readings`);
  console.log(`Date range: ${rows[0].min_date} to ${rows[0].max_date}`);

  const [sample] = await conn.execute(
    "SELECT fuel_type, reading_date, dip_litres, dip_stick_reading FROM dip_readings WHERE reading_date = '2026-03-31' ORDER BY fuel_type"
  );
  console.log('\nSample (2026-03-31):');
  console.table(sample);

} finally {
  await conn.end();
}
