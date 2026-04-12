import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const tables = [
  // employees
  `CREATE TABLE IF NOT EXISTS \`employees\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`name\` varchar(255) NOT NULL,
    \`role\` varchar(100) NOT NULL DEFAULT 'Staff',
    \`department\` enum('Operations','Finance','Management','Security','Maintenance') DEFAULT 'Operations',
    \`joinDate\` varchar(10) NOT NULL,
    \`exitDate\` varchar(10),
    \`basicSalary\` decimal(10,2) NOT NULL DEFAULT '0.00',
    \`hra\` decimal(10,2) DEFAULT '0.00',
    \`otherAllowances\` decimal(10,2) DEFAULT '0.00',
    \`pfApplicable\` boolean DEFAULT true,
    \`esiApplicable\` boolean DEFAULT true,
    \`ptApplicable\` boolean DEFAULT true,
    \`monthlyWorkingDays\` int DEFAULT 26,
    \`isActive\` boolean DEFAULT true,
    \`phone\` varchar(20),
    \`bankAccount\` varchar(50),
    \`ifscCode\` varchar(20),
    \`notes\` text,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`employees_id\` PRIMARY KEY(\`id\`)
  )`,

  // attendance
  `CREATE TABLE IF NOT EXISTS \`attendance\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`employeeId\` int NOT NULL,
    \`attendanceDate\` varchar(10) NOT NULL,
    \`status\` enum('present','absent','half_day','leave','holiday') NOT NULL DEFAULT 'present',
    \`checkIn\` varchar(8),
    \`checkOut\` varchar(8),
    \`overtimeHours\` decimal(4,2) DEFAULT '0.00',
    \`notes\` text,
    \`markedBy\` varchar(100),
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`attendance_id\` PRIMARY KEY(\`id\`)
  )`,

  // payroll_runs
  `CREATE TABLE IF NOT EXISTS \`payroll_runs\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`month\` int NOT NULL,
    \`year\` int NOT NULL,
    \`status\` enum('draft','processed','approved','paid') DEFAULT 'draft',
    \`totalGross\` decimal(15,2) DEFAULT '0.00',
    \`totalPfEmployee\` decimal(15,2) DEFAULT '0.00',
    \`totalPfEmployer\` decimal(15,2) DEFAULT '0.00',
    \`totalEsiEmployee\` decimal(15,2) DEFAULT '0.00',
    \`totalEsiEmployer\` decimal(15,2) DEFAULT '0.00',
    \`totalPt\` decimal(15,2) DEFAULT '0.00',
    \`totalNetPay\` decimal(15,2) DEFAULT '0.00',
    \`processedAt\` timestamp NULL,
    \`approvedBy\` varchar(100),
    \`notes\` text,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`payroll_runs_id\` PRIMARY KEY(\`id\`)
  )`,

  // payslips
  `CREATE TABLE IF NOT EXISTS \`payslips\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`runId\` int NOT NULL,
    \`employeeId\` int NOT NULL,
    \`month\` int NOT NULL,
    \`year\` int NOT NULL,
    \`workingDays\` int NOT NULL DEFAULT 26,
    \`daysPresent\` decimal(4,1) NOT NULL DEFAULT '0.0',
    \`basicSalary\` decimal(10,2) NOT NULL,
    \`hra\` decimal(10,2) DEFAULT '0.00',
    \`otherAllowances\` decimal(10,2) DEFAULT '0.00',
    \`grossEarned\` decimal(10,2) NOT NULL,
    \`pfEmployee\` decimal(10,2) DEFAULT '0.00',
    \`esiEmployee\` decimal(10,2) DEFAULT '0.00',
    \`professionalTax\` decimal(10,2) DEFAULT '0.00',
    \`otherDeductions\` decimal(10,2) DEFAULT '0.00',
    \`totalDeductions\` decimal(10,2) NOT NULL,
    \`pfEmployer\` decimal(10,2) DEFAULT '0.00',
    \`esiEmployer\` decimal(10,2) DEFAULT '0.00',
    \`netPay\` decimal(10,2) NOT NULL,
    \`paymentStatus\` enum('pending','paid') DEFAULT 'pending',
    \`paymentDate\` varchar(10),
    \`paymentMode\` enum('bank','cash') DEFAULT 'bank',
    \`notes\` text,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`payslips_id\` PRIMARY KEY(\`id\`)
  )`,

  // maintenance_schedules
  `CREATE TABLE IF NOT EXISTS \`maintenance_schedules\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`assetId\` int NOT NULL,
    \`maintenanceType\` varchar(100) NOT NULL,
    \`description\` text,
    \`frequency\` enum('daily','weekly','monthly','quarterly','half_yearly','annual','as_needed') NOT NULL,
    \`lastDoneDate\` varchar(10),
    \`nextDueDate\` varchar(10),
    \`estimatedCost\` decimal(10,2) DEFAULT '0.00',
    \`assignedTo\` varchar(255),
    \`isActive\` boolean DEFAULT true,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`maintenance_schedules_id\` PRIMARY KEY(\`id\`)
  )`,

  // maintenance_logs
  `CREATE TABLE IF NOT EXISTS \`maintenance_logs\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`assetId\` int NOT NULL,
    \`scheduleId\` int,
    \`doneDate\` varchar(10) NOT NULL,
    \`maintenanceType\` varchar(100) NOT NULL,
    \`description\` text,
    \`cost\` decimal(10,2) DEFAULT '0.00',
    \`technician\` varchar(255),
    \`vendor\` varchar(255),
    \`invoiceNo\` varchar(100),
    \`status\` enum('completed','partial','pending') DEFAULT 'completed',
    \`nextServiceDate\` varchar(10),
    \`notes\` text,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`maintenance_logs_id\` PRIMARY KEY(\`id\`)
  )`,

  // maintenance_evidence
  `CREATE TABLE IF NOT EXISTS \`maintenance_evidence\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`logId\` int NOT NULL,
    \`assetId\` int NOT NULL,
    \`fileName\` varchar(255) NOT NULL,
    \`fileType\` enum('image','pdf','document') NOT NULL,
    \`fileUrl\` text NOT NULL,
    \`fileKey\` varchar(500) NOT NULL,
    \`fileSizeBytes\` bigint,
    \`uploadedBy\` varchar(100),
    \`notes\` text,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`maintenance_evidence_id\` PRIMARY KEY(\`id\`)
  )`,

  // maintenance_notifications
  `CREATE TABLE IF NOT EXISTS \`maintenance_notifications\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`assetId\` int NOT NULL,
    \`scheduleId\` int,
    \`type\` enum('upcoming','overdue','completed','critical') NOT NULL,
    \`title\` varchar(255) NOT NULL,
    \`message\` text,
    \`dueDate\` varchar(10),
    \`isRead\` boolean DEFAULT false,
    \`isDismissed\` boolean DEFAULT false,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`maintenance_notifications_id\` PRIMARY KEY(\`id\`)
  )`,
];

for (const sql of tables) {
  const tableName = sql.match(/CREATE TABLE IF NOT EXISTS `(\w+)`/)[1];
  await conn.execute(sql);
  console.log(`✓ ${tableName}`);
}

await conn.end();
console.log('\nAll Phase 2 tables created successfully.');
