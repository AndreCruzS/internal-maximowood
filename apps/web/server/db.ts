import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (_db) return _db;

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[DB] DATABASE_URL not set — database features disabled");
    return null;
  }

  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 10,
  });

  _db = drizzle(pool, { schema });
  return _db;
}
