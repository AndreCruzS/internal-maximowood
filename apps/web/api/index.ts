// Vercel serverless entry. Imports the production-safe createApp; on Vercel,
// env vars come from the platform's runtime injection, so no dotenv code here.
import { createApp } from "../server/_core/createApp.js";

const app = createApp();

export default app;
