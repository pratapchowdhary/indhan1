CREATE TABLE `bank_statement_uploads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(255) NOT NULL,
	`s3_key` varchar(500) NOT NULL,
	`s3_url` text NOT NULL,
	`file_type` varchar(20) NOT NULL,
	`status` enum('uploading','parsing','done','error') NOT NULL DEFAULT 'uploading',
	`parsed_count` int DEFAULT 0,
	`matched_count` int DEFAULT 0,
	`error_message` text,
	`uploaded_by` varchar(100),
	`statement_from` varchar(10),
	`statement_to` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bank_statement_uploads_id` PRIMARY KEY(`id`)
);
