/**
 * Production-safe express + tRPC app factory.
 *
 * This file is the entry that api/index.ts (Vercel serverless) and
 * _core/index.ts (local dev) both feed off. No dev-only deps (no vite),
 * no port binding, no startServer side effect — just construct and return.
 *
 * All relative imports use .js extensions so the file works under Node ESM
 * runtime on Vercel without bundling.
 */
import "./bootstrap.js";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers.js";
import { createContext } from "./context.js";

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  return app;
}
