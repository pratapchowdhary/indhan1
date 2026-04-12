CREATE TABLE `cash_collections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int NOT NULL,
	`nozzle_id` int,
	`collection_time` timestamp NOT NULL DEFAULT (now()),
	`amount` decimal(12,2) NOT NULL,
	`payment_mode` enum('cash','card','online','credit') DEFAULT 'cash',
	`customer_id` int,
	`customer_name` varchar(255),
	`notes` text,
	`recorded_by` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cash_collections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `day_reconciliations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reconcile_date` varchar(10) NOT NULL,
	`total_petrol_litres` decimal(12,2) DEFAULT '0.00',
	`total_diesel_litres` decimal(12,2) DEFAULT '0.00',
	`total_sales_value` decimal(15,2) DEFAULT '0.00',
	`total_cash_collected` decimal(15,2) DEFAULT '0.00',
	`total_card_collected` decimal(15,2) DEFAULT '0.00',
	`total_online_collected` decimal(15,2) DEFAULT '0.00',
	`total_credit_sales` decimal(15,2) DEFAULT '0.00',
	`variance` decimal(15,2) DEFAULT '0.00',
	`status` enum('pending','balanced','discrepancy') DEFAULT 'pending',
	`reconciled_by` varchar(100),
	`reconciled_at` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `day_reconciliations_id` PRIMARY KEY(`id`),
	CONSTRAINT `day_reconciliations_reconcile_date_unique` UNIQUE(`reconcile_date`)
);
--> statement-breakpoint
CREATE TABLE `nozzle_readings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int NOT NULL,
	`nozzle_id` int NOT NULL,
	`reading_type` enum('opening','closing') NOT NULL,
	`meter_reading` decimal(12,2) NOT NULL,
	`recorded_at` timestamp NOT NULL DEFAULT (now()),
	`recorded_by` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `nozzle_readings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nozzles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pump_id` int NOT NULL,
	`nozzle_number` int NOT NULL,
	`label` varchar(50) NOT NULL,
	`fuel_type` enum('petrol','diesel') NOT NULL,
	`is_active` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `nozzles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pumps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pump_number` int NOT NULL,
	`label` varchar(50) NOT NULL,
	`location` varchar(100),
	`is_active` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pumps_id` PRIMARY KEY(`id`),
	CONSTRAINT `pumps_pump_number_unique` UNIQUE(`pump_number`)
);
--> statement-breakpoint
CREATE TABLE `shift_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shift_date` varchar(10) NOT NULL,
	`employee_id` int NOT NULL,
	`staff_name` varchar(100) NOT NULL,
	`shift_label` enum('morning','evening','full_day') DEFAULT 'full_day',
	`started_at` timestamp,
	`closed_at` timestamp,
	`status` enum('open','closed','reconciled') DEFAULT 'open',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shift_sessions_id` PRIMARY KEY(`id`)
);
