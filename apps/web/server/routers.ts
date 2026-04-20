import { publicProcedure, router } from "./_core/trpc";
import { inventoryRouter } from "./inventoryRouter";
import { pricingRouter } from "./pricingRouter";

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true })),

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
  }),

  inventory: inventoryRouter,
  pricing: pricingRouter,
});

export type AppRouter = typeof appRouter;
