import { createScraperWithProxy } from "../utils/proxy-config";
import { scrapeAndStoreInsightSourceTweets } from "./scraping-flow";
import { getPasswordFromCreds } from "../utils/hash-password";
import {
  getEligibleAccount,
  UserAccount,
  getAllEligibleAccounts,
} from "./account-manager";
import * as Sentry from "@sentry/node";
import * as dotenv from "dotenv";
import { Client } from "pg";
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
  const tweetLimit = process.env.TWEET_FETCH_LIMIT
    ? parseInt(process.env.TWEET_FETCH_LIMIT, 10)
    : 20;
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
    const accounts = await getAllEligibleAccounts(client);
    if (accounts.length === 0) {
      console.error(
        "[ERROR] No eligible Twitter accounts available for login."
      );
      process.exit(1);
    }
    let success = false;
    for (const account of accounts) {
      const password = await getPasswordFromCreds({
        username: account.username,
        email: account.email,
      });
      const credentials = {
        username: account.username,
        password,
        email: account.email,
      };
      console.log(`[INFO] Trying account: ${account.username}`);
      try {
        await scrapeAndStoreInsightSourceTweets(
          scraper,
          tweetLimit,
          credentials
        );
        success = true;
        break;
      } catch (err) {
        console.error(`[ERROR] Account ${account.username} failed:`, err);
        // Try next account
      }
    }
    if (!success) {
      console.error("[FATAL] All eligible accounts failed. Exiting.");
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[ERROR] Fatal error in main execution:", error);
  process.exit(1);
});
