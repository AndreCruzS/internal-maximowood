import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // Extract Supabase access token from Authorization header
  const authHeader = opts.req.headers.authorization;
  if (authHeader?.startsWith("Bearer ") && ENV.supabaseUrl && ENV.supabaseAnonKey) {
    try {
      const supabase = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey);
      const { data } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (data.user) {
        user = {
          id: 0,
          openId: data.user.id,
          name: data.user.user_metadata?.full_name ?? data.user.email ?? null,
          email: data.user.email ?? null,
          loginMethod: "supabase",
          role: "user",
          createdAt: new Date(data.user.created_at),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        };
      }
    } catch {
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
