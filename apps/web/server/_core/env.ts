export const ENV = {
  databaseUrl: process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseAnonKey:
    process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
  supabaseInventoryUrl: process.env.SUPABASE_INVENTORY_URL ?? "",
  supabaseInventoryAnonKey: process.env.SUPABASE_INVENTORY_ANON_KEY ?? "",
};
