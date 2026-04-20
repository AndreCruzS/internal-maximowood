CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"branchName" varchar(128) NOT NULL,
	"species" varchar(128) NOT NULL,
	"nominalSize" varchar(32),
	"profile" varchar(256),
	"lengthFt" integer,
	"pieces" integer,
	"stockLf" integer DEFAULT 0 NOT NULL,
	"lastSyncedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_sync_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"syncedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"rowsUpserted" integer DEFAULT 0 NOT NULL,
	"status" varchar(32) DEFAULT 'success' NOT NULL,
	"errorMessage" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
