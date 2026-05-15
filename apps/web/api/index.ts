// On Vercel, env vars are injected by the platform — no dotenv needed.
import { createApp } from "../server/_core/index";

const app = createApp();

export default app;
