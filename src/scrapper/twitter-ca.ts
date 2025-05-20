import { Scraper } from "agent-twitter-client";
import { Client } from "pg";
import { getPasswordFromCreds } from "../utils/hash-password";
import * as dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import {
  createJobState,
  updateJobState,
  getIncompleteJob,
  JobState,
} from "../utils/job-state-helpers";

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
const MAX_ACTIVE_SCRAPERS = parseInt(
  process.env.MAX_ACTIVE_SCRAPERS || "20",
  10
);

if (!DB_PASSWORD) {
  console.error(
    "[CRITICAL_ERROR] DB_PASSWORD is not set in the environment variables for twitter-ca.ts. Please set it in your .env file or environment."
  );
  process.exit(1);
}

const DB_CONNECTION_STRING = `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

// Helper function for exponential cooldown (in minutes)
function getExponentialCooldown(
  failureCount: number,
  baseMinutes = 60,
  maxMinutes = 10080
) {
  const cooldown = baseMinutes * Math.pow(2, failureCount - 1);
  return Math.min(cooldown, maxMinutes);
}

async function main() {
  console.log("[INFO] Starting twitter-ca.ts script execution...");
  const scraper = new Scraper();
  const dbClient = new Client({ connectionString: DB_CONNECTION_STRING });
  let loggedInScraperInstance: Scraper | null = null;
  let currentAccount: UserAccount | null = null;
  const scraperId = uuidv4();
  let jobState: JobState | null = null;
  const jobType = "twitter_profile";
  let resumeCheckpoint: string | null = null;

  try {
    console.log("[INFO] Attempting to connect to database...");
    await dbClient.connect();
    console.log("[SUCCESS] Successfully connected to the database.");

    // Point 14: Check global cap on active scrapers
    const { rows: activeRows } = await dbClient.query(
      `SELECT COUNT(*) AS active_count FROM scraper_mapping WHERE status = 'active';`
    );
    const activeCount = parseInt(activeRows[0].active_count, 10);
    if (activeCount >= MAX_ACTIVE_SCRAPERS) {
      console.log(
        `[INFO] Max active scrapers (${MAX_ACTIVE_SCRAPERS}) reached. Exiting.`
      );
      await dbClient.end();
      return;
    }

    console.log(
      "[INFO] Attempting to fetch an eligible account from database..."
    );
    const selectQuery = `
      SELECT a.id, a.email, a.username
      FROM ${DB_TABLE_NAME} a
      LEFT JOIN scraper_mapping m ON a.id = m.account_id AND m.status = 'active'
      WHERE a.is_active = TRUE
        AND a.is_burned = FALSE
        AND (a.cooldown_until IS NULL OR a.cooldown_until < NOW())
        AND (a.rest_until IS NULL OR a.rest_until < NOW())
        AND m.account_id IS NULL
      ORDER BY RANDOM()
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

    // Register mapping in scraper_mapping table
    await dbClient.query(
      `INSERT INTO scraper_mapping (scraper_id, account_id, status, started_at, last_heartbeat)
       VALUES ($1, $2, 'active', NOW(), NOW())
       ON CONFLICT (scraper_id) DO UPDATE
       SET account_id = $2, status = 'active', started_at = NOW(), last_heartbeat = NOW();`,
      [scraperId, currentAccount.id]
    );
    console.log(
      `[INFO] Registered scraper mapping for scraper_id: ${scraperId}, account_id: ${currentAccount.id}`
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

    // Check for incomplete job for this scraper/account/jobType
    const foundJobState = await getIncompleteJob(
      scraperId,
      currentAccount.id,
      jobType
    );
    if (foundJobState && foundJobState.last_checkpoint) {
      jobState = foundJobState;
      resumeCheckpoint = jobState.last_checkpoint;
      console.log(`[INFO] Resuming job from checkpoint: ${resumeCheckpoint}`);
    } else {
      // Create new job state
      jobState = await createJobState({
        scraper_id: scraperId,
        account_id: currentAccount.id,
        job_type: jobType,
        last_checkpoint: null,
        status: "running",
      });
      console.log(`[INFO] Created new job state: ${jobState.job_id}`);
    }

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
        `[INFO] Account ID: ${currentAccount.id} (${currentAccount.username}) - Fetching profile for TwitterDev...`
      );
      const profile = await scraper.getProfile("TwitterDev");
      if (profile) {
        console.log(
          `[SUCCESS] Account ID: ${currentAccount.id} (${currentAccount.username}) - Profile for TwitterDev fetched successfully.`
        );
      } else {
        console.warn(
          `[WARN] Account ID: ${currentAccount.id} (${currentAccount.username}) - Profile for TwitterDev not found or an error occurred during fetch.`
        );
      }

      console.log(
        `[INFO] Account ID: ${currentAccount.id} (${currentAccount.username}) - Fetching current user details (me)...`
      );
      const me = await scraper.me();
      console.log(me);
      const userId = await scraper.getUserIdByScreenName("TwitterDev");
      console.log(userId);
      if (me) {
        console.log(
          `[SUCCESS] Account ID: ${currentAccount.id} (${currentAccount.username}) - Current user details (me) fetched successfully. User: ${me.username}`
        );
      } else {
        console.warn(
          `[WARN] Account ID: ${currentAccount.id} (${currentAccount.username}) - Current user details (me) not found or an error occurred during fetch.`
        );
      }

      // Example: after fetching profile, update checkpoint
      await updateJobState(jobState.job_id, {
        last_checkpoint: "profile_fetched",
      });
      // Example: after fetching current user details, update checkpoint
      await updateJobState(jobState.job_id, { last_checkpoint: "me_fetched" });

      // On success, set mapping to idle and reset account
      await dbClient.query(
        `UPDATE scraper_mapping SET status = 'idle', last_heartbeat = NOW() WHERE scraper_id = $1`,
        [scraperId]
      );
      await dbClient.query(
        `UPDATE ${DB_TABLE_NAME} 
         SET last_used_at = NOW(), failure_count = 0, current_status = 'idle', scraper_started_at = NULL, cooldown_until = NULL
         WHERE id = $1`,
        [currentAccount.id]
      );
      console.log(
        `[SUCCESS] Account ID: ${currentAccount.id} (${currentAccount.username}) successfully processed and database updated (status: idle, last_used_at updated, failures reset).`
      );

      // On success, mark job as completed
      await updateJobState(jobState.job_id, { status: "completed" });
    } catch (processingError) {
      console.error(
        `[ERROR] Error processing Account ID: ${currentAccount?.id} (${currentAccount?.username}):`,
        processingError
      );

      if (currentAccount) {
        // On error, set mapping to cooldown
        await dbClient.query(
          `UPDATE scraper_mapping SET status = 'cooldown', last_heartbeat = NOW() WHERE scraper_id = $1`,
          [scraperId]
        );
        // Get current failure_count
        const { rows } = await dbClient.query(
          `UPDATE ${DB_TABLE_NAME} 
           SET failure_count = failure_count + 1
           WHERE id = $1
           RETURNING failure_count;`,
          [currentAccount.id]
        );
        const newFailureCount = rows[0]?.failure_count;
        const cooldownMinutes = getExponentialCooldown(newFailureCount);
        await dbClient.query(
          `UPDATE ${DB_TABLE_NAME}
           SET cooldown_until = NOW() + INTERVAL '${cooldownMinutes} minutes'
           WHERE id = $1`,
          [currentAccount.id]
        );
        console.log(
          `[INFO] Account ID: ${currentAccount.id} (${currentAccount.username}) - New failure_count: ${newFailureCount}, cooldown set to ${cooldownMinutes} minutes.`
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

      if (jobState) {
        await updateJobState(jobState.job_id, {
          status: "failed",
          error_message:
            processingError instanceof Error
              ? processingError.message
              : String(processingError),
        });
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
