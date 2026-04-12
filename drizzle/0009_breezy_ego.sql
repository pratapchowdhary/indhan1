ALTER TABLE `expenses` ADD `payment_source` enum('bank','cash_nozzle','cash_general') DEFAULT 'bank';--> statement-breakpoint
ALTER TABLE `expenses` ADD `nozzle_id` int;