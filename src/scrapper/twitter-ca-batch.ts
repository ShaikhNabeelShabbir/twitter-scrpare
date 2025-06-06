import { createScraperWithProxy } from "../utils/proxy-config";
import { scrapeAndStoreInsightSourceTweets } from "./scraping-flow";
import { getPasswordFromCreds } from "../utils/hash-password";
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
  const username = process.env.TWITTER_LOGIN_USERNAME;
  const email = process.env.TWITTER_LOGIN_EMAIL;
  if (!username || !email) {
    console.error(
      "[ERROR] Please set TWITTER_LOGIN_USERNAME and TWITTER_LOGIN_EMAIL in your environment."
    );
    process.exit(1);
  }
  const password = await getPasswordFromCreds({ username, email });
  const credentials = { username, password, email };
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
    await scrapeAndStoreInsightSourceTweets(scraper, tweetLimit, credentials);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[ERROR] Fatal error in main execution:", error);
  process.exit(1);
});
