import { runScraperJob } from "./scraper-orchestrator";
import { createScraperWithProxy } from "../utils/proxy-config";
import * as Sentry from "@sentry/node";
import * as dotenv from "dotenv";
dotenv.config();

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  tracesSampleRate: 1.0,
});

process.on("unhandledRejection", (reason) => {
  Sentry.captureException(reason);
  console.error("[UNHANDLED_REJECTION]", reason);
});

process.on("uncaughtException", (error) => {
  Sentry.captureException(error);
  console.error("[UNCAUGHT_EXCEPTION]", error);
});

async function main() {
  console.log("[INFO] Starting twitter-ca.ts script execution...");
  const username = process.argv[2];
  if (!username) {
    console.error(
      "[ERROR] Please provide a Twitter username as an argument. Usage: node dist/scrapper/twitter-ca.js <twitter_username>"
    );
    process.exit(1);
  }
  const proxyUrl = process.env.PROXY_URL;
  const scraper = createScraperWithProxy(proxyUrl);
  await runScraperJob(scraper, "twitter_profile", username);
  console.log("[INFO] twitter-ca.ts script execution finished.");
}

main().catch((error) => {
  console.error("[ERROR] Fatal error in main execution:", error);
  process.exit(1);
});
