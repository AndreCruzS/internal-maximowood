import { publicProcedure, router } from "./_core/trpc.js";
import { inventoryRouter } from "./inventoryRouter.js";
import { pricingRouter } from "./pricingRouter.js";

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true })),

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
  }),

  inventory: inventoryRouter,
  pricing: pricingRouter,
});

export type AppRouter = typeof appRouter;
