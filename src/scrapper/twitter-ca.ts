import { runScraperJob } from "./scraper-orchestrator";
import { createScraperWithProxy } from "../utils/proxy-config";
import { scrapeAndStoreInsightSourceTweets } from "./scraping-flow";
import * as Sentry from "@sentry/node";
import * as dotenv from "dotenv";
import { Client } from "pg";
import { exec } from "child_process";
dotenv.config();

process.on("unhandledRejection", (reason) => {
  Sentry.captureException(reason);
  console.error("[UNHANDLED_REJECTION]", reason);
});

process.on("uncaughtException", (error) => {
  Sentry.captureException(error);
  console.error("[UNCAUGHT_EXCEPTION]", error);
});

async function main() {
  const isBatch = process.argv.includes("--batch");
  const username = process.argv[2] || process.env.TWITTER_USERNAME;
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
    if (isBatch) {
      const tweetLimit = process.env.TWEET_FETCH_LIMIT
        ? parseInt(process.env.TWEET_FETCH_LIMIT, 10)
        : 20;
      const credentials = {
        username: process.env.TWITTER_LOGIN_USERNAME!,
        password: process.env.TWITTER_LOGIN_PASSWORD!,
        email: process.env.TWITTER_LOGIN_EMAIL!,
      };
      await scrapeAndStoreInsightSourceTweets(scraper, tweetLimit, credentials);
    } else {
      if (!username) {
        console.error(
          "[ERROR] Please provide a Twitter username as an argument or set the TWITTER_USERNAME environment variable. Usage: node dist/scrapper/twitter-ca.js <twitter_username>"
        );
        process.exit(1);
      }
      await runScraperJob(scraper, "twitter_profile", username, client);
      // After successful profile fetch, run the batch script
      exec(
        "node dist/scrapper/twitter-ca-batch.js",
        (error, stdout, stderr) => {
          if (error) {
            console.error(`[BATCH ERROR] ${error.message}`);
            return;
          }
          if (stderr) {
            console.error(`[BATCH STDERR] ${stderr}`);
          }
          console.log(`[BATCH STDOUT] ${stdout}`);
        }
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[ERROR] Fatal error in main execution:", error);
  process.exit(1);
});
