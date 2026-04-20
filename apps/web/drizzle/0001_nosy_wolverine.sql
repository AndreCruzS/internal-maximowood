CREATE TABLE `inventory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchName` varchar(128) NOT NULL,
	`species` varchar(128) NOT NULL,
	`nominalSize` varchar(32),
	`profile` varchar(256),
	`stockLf` int NOT NULL DEFAULT 0,
	`lastSyncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventorySyncLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	`rowsUpserted` int NOT NULL DEFAULT 0,
	`status` varchar(32) NOT NULL DEFAULT 'success',
	`errorMessage` text,
	CONSTRAINT `inventorySyncLog_id` PRIMARY KEY(`id`)
);
