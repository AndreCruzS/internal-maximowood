/**
 * schema-pg.ts
 *
 * PostgreSQL version of drizzle/schema.ts.
 * Replace drizzle/schema.ts with this file when migrating to Supabase.
 *
 * Key differences from the MySQL version:
 *   - mysqlTable  → pgTable
 *   - mysqlEnum   → pgEnum
 *   - int         → integer / serial
 *   - timestamp   → timestamp (with timezone)
 *   - varchar     → varchar (same)
 *   - autoincrement().primaryKey() → serial().primaryKey()
 *   - .onUpdateNow() does not exist in pg-core — use a DB trigger instead
 *     (see migration 001_initial_schema.sql → trg_users_updated_at)
 */

import {
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// ── Enums ─────────────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

// ── users ─────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id:           serial("id").primaryKey(),
  openId:       varchar("openId", { length: 64 }).notNull().unique(),
  name:         text("name"),
  email:        varchar("email", { length: 320 }),
  loginMethod:  varchar("loginMethod", { length: 64 }),
  role:         userRoleEnum("role").default("user").notNull(),
  createdAt:    timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:    timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ── inventory ─────────────────────────────────────────────────────────────────
export const inventory = pgTable("inventory", {
  id:           serial("id").primaryKey(),
  branchName:   varchar("branchName", { length: 128 }).notNull(),
  species:      varchar("species", { length: 128 }).notNull(),
  nominalSize:  varchar("nominalSize", { length: 32 }),
  profile:      varchar("profile", { length: 256 }),
  lengthFt:     integer("lengthFt"),
  pieces:       integer("pieces"),
  stockLf:      integer("stockLf").notNull().default(0),
  lastSyncedAt: timestamp("lastSyncedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type InventoryItem = typeof inventory.$inferSelect;
export type InsertInventoryItem = typeof inventory.$inferInsert;

// ── inventorySyncLog ──────────────────────────────────────────────────────────
export const inventorySyncLog = pgTable("inventory_sync_log", {
  id:           serial("id").primaryKey(),
  syncedAt:     timestamp("syncedAt", { withTimezone: true }).defaultNow().notNull(),
  rowsUpserted: integer("rowsUpserted").notNull().default(0),
  status:       varchar("status", { length: 32 }).notNull().default("success"),
  errorMessage: text("errorMessage"),
});

export type InventorySyncLog = typeof inventorySyncLog.$inferSelect;
