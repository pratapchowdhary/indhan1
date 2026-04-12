CREATE TABLE `attendance_score` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`scoreDate` varchar(10) NOT NULL,
	`totalSlots` int DEFAULT 0,
	`verifiedSlots` int DEFAULT 0,
	`missedSlots` int DEFAULT 0,
	`excusedSlots` int DEFAULT 0,
	`scorePercent` decimal(5,2) DEFAULT '0.00',
	`dayStatus` enum('present','absent','partial','off_day') DEFAULT 'present',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_score_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `checkin_slots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`slotDate` varchar(10) NOT NULL,
	`slotHour` int NOT NULL,
	`scheduledAt` timestamp NOT NULL,
	`windowEndsAt` timestamp NOT NULL,
	`status` enum('pending','verified','missed','excused') DEFAULT 'pending',
	`verifiedAt` timestamp,
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`distanceMetres` decimal(8,2),
	`faceMatchScore` decimal(5,4),
	`verificationMethod` enum('face_geo','face_only','manual'),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `checkin_slots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employee_auth` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`pinHash` varchar(255) NOT NULL,
	`faceEnrolled` boolean DEFAULT false,
	`faceDescriptor` text,
	`faceEnrolledAt` timestamp,
	`lastLoginAt` timestamp,
	`failedAttempts` int DEFAULT 0,
	`lockedUntil` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_auth_id` PRIMARY KEY(`id`),
	CONSTRAINT `employee_auth_employeeId_unique` UNIQUE(`employeeId`)
);
--> statement-breakpoint
CREATE TABLE `payroll_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`requestType` enum('weekly','monthly') NOT NULL,
	`periodStart` varchar(10) NOT NULL,
	`periodEnd` varchar(10) NOT NULL,
	`attendanceScore` decimal(5,2),
	`eligibleDays` decimal(4,1),
	`grossAmount` decimal(10,2),
	`deductions` decimal(10,2) DEFAULT '0.00',
	`netAmount` decimal(10,2),
	`status` enum('pending','approved','rejected','paid') DEFAULT 'pending',
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	`reviewedBy` varchar(100),
	`reviewedAt` timestamp,
	`reviewNotes` text,
	`paidAt` timestamp,
	`paymentMode` enum('bank','cash'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payroll_requests_id` PRIMARY KEY(`id`)
);
