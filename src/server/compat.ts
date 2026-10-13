type Result<T> = { data: T | null; error: { code?: string; message: string } | null };

/**
 * Runs a select with the newest columns; if the database doesn't have them yet
 * (a migration not applied — Postgres 42703 / PostgREST PGRST204), retries with the older list
 * so pages never come up empty while a migration is pending.
 */
export async function selectCompat<T>(run: (columns: string) => PromiseLike<Result<T>>, columns: string, fallback: string): Promise<Result<T>> {
  const first = await run(columns);
  if (!first.error || !["42703", "PGRST204"].includes(first.error.code ?? "")) return first;
  return run(fallback);
}
