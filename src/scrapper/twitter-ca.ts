import { Scraper } from "agent-twitter-client";
import { Client } from "pg";
import { getPasswordFromCreds } from "../utils/hash-password";
import * as dotenv from "dotenv";

dotenv.config();

interface UserAccount {
  id: string;
  email: string;
  username: string;
}

const DB_USER = process.env.DB_USER || "postgres";
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_NAME = process.env.DB_NAME || "mydb";
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_PORT = process.env.DB_PORT || "5432";
const DB_TABLE_NAME = process.env.DB_TABLE_NAME || "twitter_accounts";
const MAX_FAILURE_COUNT = parseInt(
  process.env.MAX_FAILURE_COUNT_TWITTER_CA || "3",
  10
);

if (!DB_PASSWORD) {
  console.error(
    "[CRITICAL_ERROR] DB_PASSWORD is not set in the environment variables for twitter-ca.ts. Please set it in your .env file or environment."
  );
  process.exit(1);
}

const DB_CONNECTION_STRING = `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

async function main() {
  console.log("[INFO] Starting twitter-ca.ts script execution...");
  const scraper = new Scraper();
  const dbClient = new Client({ connectionString: DB_CONNECTION_STRING });
  let loggedInScraperInstance: Scraper | null = null;
  let currentAccount: UserAccount | null = null;

  try {
    console.log("[INFO] Attempting to connect to database...");
    await dbClient.connect();
    console.log("[SUCCESS] Successfully connected to the database.");

    console.log(
      "[INFO] Attempting to fetch an eligible account from database..."
    );
    const selectQuery = `
      SELECT id, email, username
      FROM ${DB_TABLE_NAME}
      WHERE is_active = TRUE
        AND is_burned = FALSE
        AND (cooldown_until IS NULL OR cooldown_until < NOW())
        AND (rest_until IS NULL OR rest_until < NOW())
      ORDER BY last_used_at ASC NULLS FIRST, id
      LIMIT 1;
    `;
    console.log(
      `[DB_QUERY] Executing account selection query: ${selectQuery
        .replace(/\s+/g, " ")
        .trim()}`
    );
    const dbResult = await dbClient.query(selectQuery);

    if (dbResult.rows.length === 0) {
      console.log(
        "[INFO] No eligible accounts found in the database at this time. Exiting."
      );
      return;
    }

    currentAccount = dbResult.rows[0] as UserAccount;
    console.log(
      `[INFO] Selected Account - Username: ${currentAccount.username}, ID: ${currentAccount.id} for processing.`
    );

    console.log(
      `[INFO] Updating account status in DB for Account ID: ${currentAccount.id} - Setting current_status='active', scraper_started_at=NOW().`
    );
    await dbClient.query(
      `UPDATE ${DB_TABLE_NAME} 
       SET current_status = 'active', scraper_started_at = NOW() 
       WHERE id = $1`,
      [currentAccount.id]
    );
    console.log(
      `[SUCCESS] Account ID: ${currentAccount.id} (${currentAccount.username}) marked as 'active' in database.`
    );

    try {
      console.log(
        `[INFO] Account ID: ${currentAccount.id} (${currentAccount.username}) - Generating password.`
      );
      const password = await getPasswordFromCreds({
        username: currentAccount.username,
        email: currentAccount.email,
      });
      console.log(
        `[SUCCESS] Account ID: ${currentAccount.id} (${currentAccount.username}) - Password generated.`
      );

      console.log(
        `[INFO] Account ID: ${currentAccount.id} (${currentAccount.username}) - Attempting scraper login.`
      );
      await scraper.login(
        currentAccount.username,
        password,
        currentAccount.email
      );
      loggedInScraperInstance = scraper;
      console.log(
        `[SUCCESS] Account ID: ${currentAccount.id} (${currentAccount.username}) - Scraper login successful.`
      );

      console.log(
        `[INFO] Account ID: ${currentAccount.id} (${currentAccount.username}) - Fetching profile for NabeelShaikh03...`
      );
      const profile = await scraper.getProfile("NabeelShaikh03");
      if (profile) {
        console.log(
          `[SUCCESS] Account ID: ${currentAccount.id} (${currentAccount.username}) - Profile for NabeelShaikh03 fetched successfully.`
        );
      } else {
        console.warn(
          `[WARN] Account ID: ${currentAccount.id} (${currentAccount.username}) - Profile for NabeelShaikh03 not found or an error occurred during fetch.`
        );
      }

      console.log(
        `[INFO] Account ID: ${currentAccount.id} (${currentAccount.username}) - Fetching current user details (me)...`
      );
      const me = await scraper.me();
      if (me) {
        console.log(
          `[SUCCESS] Account ID: ${currentAccount.id} (${currentAccount.username}) - Current user details (me) fetched successfully. User: ${me.username}`
        );
      } else {
        console.warn(
          `[WARN] Account ID: ${currentAccount.id} (${currentAccount.username}) - Current user details (me) not found or an error occurred during fetch.`
        );
      }

      console.log(
        `[INFO] Account ID: ${currentAccount.id} (${currentAccount.username}) - Updating database: last_used_at=NOW(), failure_count=0, current_status='idle', scraper_started_at=NULL.`
      );
      await dbClient.query(
        `UPDATE ${DB_TABLE_NAME} 
         SET last_used_at = NOW(), failure_count = 0, current_status = 'idle', scraper_started_at = NULL
         WHERE id = $1`,
        [currentAccount.id]
      );
      console.log(
        `[SUCCESS] Account ID: ${currentAccount.id} (${currentAccount.username}) successfully processed and database updated (status: idle, last_used_at updated, failures reset).`
      );
    } catch (processingError) {
      console.error(
        `[ERROR] Error processing Account ID: ${currentAccount?.id} (${currentAccount?.username}):`,
        processingError
      );

      if (currentAccount) {
        console.log(
          `[INFO] Account ID: ${currentAccount.id} (${currentAccount.username}) - Incrementing failure_count in database.`
        );
        const { rows } = await dbClient.query(
          `UPDATE ${DB_TABLE_NAME} 
           SET failure_count = failure_count + 1
           WHERE id = $1
           RETURNING failure_count;`,
          [currentAccount.id]
        );
        const newFailureCount = rows[0]?.failure_count;
        console.log(
          `[INFO] Account ID: ${currentAccount.id} (${currentAccount.username}) - New failure_count: ${newFailureCount}.`
        );

        if (newFailureCount >= MAX_FAILURE_COUNT) {
          console.log(
            `[INFO] Account ID: ${currentAccount.id} (${currentAccount.username}) - Max failure count exceeded. Marking as burned.`
          );
          await dbClient.query(
            `UPDATE ${DB_TABLE_NAME} 
             SET is_burned = TRUE, current_status = 'burned', scraper_started_at = NULL
             WHERE id = $1`,
            [currentAccount.id]
          );
          console.log(
            `[SUCCESS] Account ID: ${currentAccount.id} (${currentAccount.username}) marked as 'burned' in database.`
          );
        } else {
          console.log(
            `[INFO] Account ID: ${currentAccount.id} (${currentAccount.username}) - Setting status to 'idle' after error.`
          );
          await dbClient.query(
            `UPDATE ${DB_TABLE_NAME} 
             SET current_status = 'idle', scraper_started_at = NULL 
             WHERE id = $1`,
            [currentAccount.id]
          );
          console.log(
            `[SUCCESS] Account ID: ${currentAccount.id} (${currentAccount.username}) status set to 'idle' in database after error.`
          );
        }
      } else {
        console.error(
          "[ERROR] currentAccount was null during error handling. Cannot update database for failure count."
        );
      }
    }
  } catch (error) {
    console.error(
      "[CRITICAL_ERROR] A critical error occurred in the main process:",
      error
    );
  } finally {
    if (loggedInScraperInstance && currentAccount) {
      try {
        console.log(
          `[INFO] Attempting to logout scraper for Account ID: ${currentAccount.id} (${currentAccount.username})...`
        );
        await loggedInScraperInstance.logout();
        console.log(
          `[SUCCESS] Scraper for Account ID: ${currentAccount.id} (${currentAccount.username}) logged out successfully.`
        );
      } catch (logoutError) {
        console.error(
          `[ERROR] Error during scraper logout for Account ID: ${currentAccount.id} (${currentAccount.username}):`,
          logoutError
        );
      }
    } else if (currentAccount) {
      console.log(
        `[INFO] Scraper logout not attempted for Account ID: ${currentAccount.id} (${currentAccount.username}) as login was not confirmed or account not fully processed.`
      );
    } else {
      console.log(
        "[INFO] Scraper logout not attempted as no account was fully selected or login not confirmed."
      );
    }

    if (dbClient) {
      try {
        console.log("[INFO] Attempting to close database connection...");
        await dbClient.end();
        console.log("[SUCCESS] Database connection closed.");
      } catch (dbCloseError) {
        console.error(
          "[ERROR] Failed to close database connection:",
          dbCloseError
        );
      }
    }
    console.log("[INFO] twitter-ca.ts script execution finished.");
  }
}

main();
