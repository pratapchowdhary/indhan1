CREATE TABLE `cash_deposit_vouchers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`voucher_number` varchar(30) NOT NULL,
	`voucher_date` varchar(10) NOT NULL,
	`total_cash_collected` decimal(14,2) NOT NULL,
	`total_cash_expenses` decimal(14,2) NOT NULL DEFAULT '0',
	`float_retained` decimal(14,2) NOT NULL DEFAULT '0',
	`deposit_amount` decimal(14,2) NOT NULL,
	`bank_account` varchar(200),
	`deposit_instructions` text,
	`status` enum('draft','finalised','deposited','reconciled') NOT NULL DEFAULT 'draft',
	`bank_transaction_id` int,
	`reconciledAt` timestamp,
	`reconciled_by` varchar(100),
	`generated_by` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cash_deposit_vouchers_id` PRIMARY KEY(`id`),
	CONSTRAINT `cash_deposit_vouchers_voucher_number_unique` UNIQUE(`voucher_number`)
);
--> statement-breakpoint
CREATE TABLE `cash_handover_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`handover_date` varchar(10) NOT NULL,
	`nozzle_id` int NOT NULL,
	`cash_collected` decimal(14,2) NOT NULL DEFAULT '0',
	`cash_expenses` decimal(14,2) NOT NULL DEFAULT '0',
	`net_cash` decimal(14,2) NOT NULL DEFAULT '0',
	`actual_amount` decimal(14,2),
	`variance` decimal(14,2),
	`confirmedAt` timestamp,
	`confirmed_by` varchar(100),
	`deposit_voucher_id` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cash_handover_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `cash_collections` MODIFY COLUMN `payment_mode` enum('cash','digital','credit') DEFAULT 'cash';--> statement-breakpoint
ALTER TABLE `cash_collections` ADD `digital_sub_type` varchar(20);