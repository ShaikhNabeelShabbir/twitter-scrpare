import { runScraperJob } from "./scraper-orchestrator";
import { createScraperWithProxy } from "../utils/proxy-config";
import { getEligibleAccount, UserAccount } from "./account-manager";
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

async function loginWithAccount(scraper: any, account: UserAccount) {
  const password = await getPasswordFromCreds({
    username: account.username,
    email: account.email,
  });
  try {
    await scraper.login(account.username, password, account.email);
    console.log(`[INFO] Logged in as @${account.username}`);
    return true;
  } catch (err) {
    console.error(`[ERROR] Login failed for @${account.username}:`, err);
    return false;
  }
}

async function main() {
  // Get all usernames passed as arguments (after the script name)
  const usernames = process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"));
  if (usernames.length === 0) {
    console.error(
      "[ERROR] Please provide at least one Twitter username as an argument. Usage: node dist/scrapper/twitter-ca.js <twitter_username1> <twitter_username2> ..."
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
    // Get all eligible accounts up front
    let accounts: UserAccount[] = [];
    let account: UserAccount | null = null;
    let accountIndex = 0;
    // Fetch all eligible accounts
    while (true) {
      const acc = await getEligibleAccount(client);
      if (!acc) break;
      // Avoid duplicates
      if (!accounts.find((a) => a.id === acc.id)) {
        accounts.push(acc);
      }
      // Temporarily mark as used to avoid infinite loop
      accountIndex++;
      if (accountIndex > 20) break; // safety
    }
    if (accounts.length === 0) {
      console.error("[ERROR] No eligible accounts available.");
      process.exit(1);
    }
    accountIndex = 0;
    account = accounts[accountIndex];
    let loggedIn = await loginWithAccount(scraper, account);
    if (!loggedIn) {
      // Try next account
      let found = false;
      for (let i = 1; i < accounts.length; i++) {
        account = accounts[i];
        loggedIn = await loginWithAccount(scraper, account);
        if (loggedIn) {
          accountIndex = i;
          found = true;
          break;
        }
      }
      if (!found) {
        console.error("[ERROR] Could not log in with any eligible account.");
        process.exit(1);
      }
    }
    for (const username of usernames) {
      let success = false;
      let retries = 0;
      while (!success && retries < accounts.length) {
        try {
          await runScraperJob(scraper, "twitter_profile", username, client);
          success = true;
        } catch (err) {
          console.error(
            `[ERROR] Scraping ${username} failed with account @${account.username}:`,
            err
          );
          // Switch to next account
          accountIndex = (accountIndex + 1) % accounts.length;
          account = accounts[accountIndex];
          const relogin = await loginWithAccount(scraper, account);
          if (!relogin) {
            console.error(
              `[ERROR] Login failed for @${account.username}, trying next account.`
            );
            retries++;
            continue;
          }
          retries++;
        }
      }
      if (!success) {
        console.error(`[FATAL] Could not scrape ${username} with any account.`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[ERROR] Fatal error in main execution:", error);
  process.exit(1);
});
