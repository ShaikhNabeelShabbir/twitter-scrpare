import { runScraperJob } from "./scraper-orchestrator";
import { createScraperWithProxy } from "../utils/proxy-config";
import * as Sentry from "@sentry/node";
import * as dotenv from "dotenv";
import { Client } from "pg";
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
  const username = process.argv[2] || process.env.TWITTER_USERNAME;
  if (!username) {
    console.error(
      "[ERROR] Please provide a Twitter username as an argument or set the TWITTER_USERNAME environment variable. Usage: node dist/scrapper/twitter-ca.js <twitter_username>"
    );
    process.exit(1);
  }
  const proxyUrl = process.env.PROXY_URL;
  const scraper = createScraperWithProxy(proxyUrl);
  const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || "5432"),
  });
  try {
    await client.connect();
    await runScraperJob(scraper, "twitter_profile", username, client);
  } finally {
    await client.end();
  }
  console.log("[INFO] twitter-ca.ts script execution finished.");
}

main().catch((error) => {
  console.error("[ERROR] Fatal error in main execution:", error);
  process.exit(1);
});
