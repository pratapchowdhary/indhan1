CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`userName` varchar(255),
	`userRole` varchar(64),
	`action` varchar(64) NOT NULL,
	`module` varchar(64) NOT NULL,
	`resourceId` varchar(64),
	`details` text,
	`ipAddress` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('owner','incharge','accountant','user','admin','pump_attendant') NOT NULL DEFAULT 'user',
	`token` varchar(128) NOT NULL,
	`invitedBy` int NOT NULL,
	`invitedByName` varchar(255),
	`status` enum('pending','accepted','revoked','expired') NOT NULL DEFAULT 'pending',
	`acceptedAt` timestamp,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_invitations_token_unique` UNIQUE(`token`)
);
