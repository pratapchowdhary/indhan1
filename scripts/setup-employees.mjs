/**
 * Setup real employee records for BEES Fuel Station.
 * Clears all test/placeholder employees and inserts the 5 confirmed active staff.
 * 
 * Staff confirmed:
 * 1. Mahesh      - Incharge, 6AM-10PM, works daily
 * 2. Ashok       - Pump Attendant, 24h rotation (15 days/month), Day-primary
 * 3. Kiran       - Pump Attendant, 24h rotation (15 days/month)
 * 4. Parandhamulu - Pump Attendant, 24h rotation (15 days/month)
 * 5. Anjaiah     - Pump Attendant, 24h rotation (15 days/month)
 * 
 * Salary from expense records (latest known):
 * Mahesh: ~19,000/month
 * Ashok: ~9,066/month
 * Kiran: ~6,600/month
 * Parandhamulu: ~6,500/month
 * Anjaiah: ~6,500/month
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Delete all existing employees (test data)
const [del] = await conn.execute('DELETE FROM employees');
console.log(`Deleted ${del.affectedRows} existing employee records`);

// Reset auto-increment
await conn.execute('ALTER TABLE employees AUTO_INCREMENT = 1');

// Insert real employees
const employees = [
  {
    name: 'Mahesh',
    role: 'Incharge',
    department: 'Management',
    joinDate: '2024-04-01',
    basicSalary: 19000.00,
    hra: 0.00,
    otherAllowances: 0.00,
    pfApplicable: 0,
    esiApplicable: 0,
    ptApplicable: 0,
    monthlyWorkingDays: 26,
    isActive: 1,
    // Shift: 6AM-10PM daily, check-ins active 6AM-10PM
    shiftType: 'day_incharge',
    shiftStart: '06:00',
    shiftEnd: '22:00',
    notes: 'Incharge. Works 6AM-10PM with breaks. Check-ins 6AM-10PM only.'
  },
  {
    name: 'Ashok',
    role: 'Pump Attendant',
    department: 'Operations',
    joinDate: '2024-04-01',
    basicSalary: 9066.00,
    hra: 0.00,
    otherAllowances: 0.00,
    pfApplicable: 1,
    esiApplicable: 1,
    ptApplicable: 0,
    monthlyWorkingDays: 15,
    isActive: 1,
    shiftType: 'rotation_24h',
    shiftStart: '06:00',
    shiftEnd: '06:00',
    notes: '24h rotation. ~15 working days/month. Day off after 24h duty.'
  },
  {
    name: 'Kiran',
    role: 'Pump Attendant',
    department: 'Operations',
    joinDate: '2024-04-01',
    basicSalary: 6600.00,
    hra: 0.00,
    otherAllowances: 0.00,
    pfApplicable: 1,
    esiApplicable: 1,
    ptApplicable: 0,
    monthlyWorkingDays: 15,
    isActive: 1,
    shiftType: 'rotation_24h',
    shiftStart: '06:00',
    shiftEnd: '06:00',
    notes: '24h rotation. ~15 working days/month. Day off after 24h duty.'
  },
  {
    name: 'Parandhamulu',
    role: 'Pump Attendant',
    department: 'Operations',
    joinDate: '2024-10-01',
    basicSalary: 6500.00,
    hra: 0.00,
    otherAllowances: 0.00,
    pfApplicable: 1,
    esiApplicable: 1,
    ptApplicable: 0,
    monthlyWorkingDays: 15,
    isActive: 1,
    shiftType: 'rotation_24h',
    shiftStart: '06:00',
    shiftEnd: '06:00',
    notes: '24h rotation. ~15 working days/month. Day off after 24h duty.'
  },
  {
    name: 'Anjaiah',
    role: 'Pump Attendant',
    department: 'Operations',
    joinDate: '2025-12-01',
    basicSalary: 6500.00,
    hra: 0.00,
    otherAllowances: 0.00,
    pfApplicable: 1,
    esiApplicable: 1,
    ptApplicable: 0,
    monthlyWorkingDays: 15,
    isActive: 1,
    shiftType: 'rotation_24h',
    shiftStart: '06:00',
    shiftEnd: '06:00',
    notes: '24h rotation. ~15 working days/month. Day off after 24h duty.'
  }
];

for (const emp of employees) {
  await conn.execute(
    `INSERT INTO employees (name, role, department, joinDate, basicSalary, hra, otherAllowances, pfApplicable, esiApplicable, ptApplicable, monthlyWorkingDays, isActive, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [emp.name, emp.role, emp.department, emp.joinDate, emp.basicSalary, emp.hra, emp.otherAllowances,
     emp.pfApplicable, emp.esiApplicable, emp.ptApplicable, emp.monthlyWorkingDays, emp.isActive, emp.notes]
  );
  console.log(`Inserted: ${emp.name} (${emp.role})`);
}

// Verify
const [result] = await conn.execute('SELECT id, name, role, basicSalary, monthlyWorkingDays FROM employees ORDER BY id');
console.log('\nFINAL EMPLOYEES:');
result.forEach(e => console.log(`  ID ${e.id}: ${e.name} | ${e.role} | ₹${e.basicSalary}/month | ${e.monthlyWorkingDays} days`));

await conn.end();
console.log('\nDone!');
