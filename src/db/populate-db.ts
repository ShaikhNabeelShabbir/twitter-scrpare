import * as fs from "fs/promises";
import { Client } from "pg";
import * as dotenv from "dotenv";

dotenv.config(); // Load environment variables from .env file

interface UserAccount {
  email: string;
  username: string;
}

// Load Database Credentials and configurations from environment variables
const DB_USER = process.env.DB_USER || "postgres";
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_NAME = process.env.DB_NAME || "mydb";
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_PORT = process.env.DB_PORT || "5432";
const DB_TABLE_NAME = process.env.DB_TABLE_NAME || "twitter_accounts";
const ACCOUNTS_FILE_PATH = process.env.ACCOUNTS_FILE_PATH || "use-account.json";

if (!DB_PASSWORD) {
  console.error(
    "[CRITICAL_ERROR] DB_PASSWORD is not set in the environment variables. Please set it in your .env file or environment."
  );
  process.exit(1);
}

const DB_URL = `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

async function populateDatabase() {
  console.log("[INFO] Starting database population script (populate-db.ts)...");
  const client = new Client({ connectionString: DB_URL });

  try {
    console.log(
      `[INFO] Attempting to connect to database: ${DB_HOST}:${DB_PORT}/${DB_NAME} as user ${DB_USER}...`
    );
    await client.connect();
    console.log("[SUCCESS] Successfully connected to the database.");

    try {
      console.log('[INFO] Ensuring "pgcrypto" extension is enabled...');
      await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
      console.log(
        '[SUCCESS] "pgcrypto" extension is ready or already enabled.'
      );
    } catch (extError) {
      console.warn(
        '[WARN] Could not ensure "pgcrypto" extension is enabled. UUID generation might fail if not available.',
        extError
      );
    }

    console.log(
      `[INFO] Ensuring table ${DB_TABLE_NAME} exists with the defined schema...`
    );
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${DB_TABLE_NAME} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        is_active BOOLEAN DEFAULT TRUE,
        is_burned BOOLEAN DEFAULT FALSE,
        failure_count INTEGER DEFAULT 0,
        cooldown_until TIMESTAMP WITH TIME ZONE,
        rest_until TIMESTAMP WITH TIME ZONE,
        last_used_at TIMESTAMP WITH TIME ZONE,
        current_status TEXT DEFAULT 'idle',
        scraper_started_at TIMESTAMP WITH TIME ZONE
      );
    `;
    await client.query(createTableQuery);
    console.log(
      `[SUCCESS] Table ${DB_TABLE_NAME} is ready with the defined schema.`
    );

    console.log(`[INFO] Reading accounts from ${ACCOUNTS_FILE_PATH}...`);
    const accountsData = await fs.readFile(ACCOUNTS_FILE_PATH, "utf-8");
    const accounts: UserAccount[] = JSON.parse(accountsData);

    if (!accounts || accounts.length === 0) {
      console.log(
        `[INFO] No accounts found in ${ACCOUNTS_FILE_PATH}. Exiting data insertion.`
      );
      return;
    }

    console.log(`[INFO] Inserting data into table: ${DB_TABLE_NAME}...`);
    let SucceededCount = 0;
    let SkippedCount = 0;
    let FailedCount = 0;

    for (const account of accounts) {
      try {
        const insertQuery = `
          INSERT INTO ${DB_TABLE_NAME} (email, username)
          VALUES ($1, $2)
          ON CONFLICT (email) DO NOTHING;
        `;

        const res = await client.query(insertQuery, [
          account.email,
          account.username,
        ]);

        if (res.rowCount !== null && res.rowCount > 0) {
          console.log(
            `[SUCCESS] Inserted/Processed: ${account.username} (${account.email}) into ${DB_TABLE_NAME}.`
          );
          SucceededCount++;
        } else {
          console.log(
            `[INFO] Skipped (already exists based on email conflict): ${account.username} (${account.email}) in ${DB_TABLE_NAME}.`
          );
          SkippedCount++;
        }
      } catch (insertError) {
        console.error(
          `[ERROR] Error inserting ${account.username} (${account.email}) into ${DB_TABLE_NAME}:`,
          insertError
        );
        FailedCount++;
      }
    }

    console.log("[INFO] Data insertion process summary:");
    console.log(`  Successfully Inserted/Processed: ${SucceededCount}`);
    console.log(`  Skipped (due to conflict): ${SkippedCount}`);
    console.log(`  Failed to Insert: ${FailedCount}`);
    console.log("[INFO] Data insertion process completed.");
  } catch (error) {
    console.error(
      "[CRITICAL_ERROR] An error occurred during the database population process:",
      error
    );
  } finally {
    if (client) {
      try {
        console.log("[INFO] Attempting to close database connection...");
        await client.end();
        console.log("[SUCCESS] Database connection closed.");
      } catch (dbCloseError) {
        console.error(
          "[ERROR] Failed to close database connection:",
          dbCloseError
        );
      }
    }
    console.log("[INFO] Database population script (populate-db.ts) finished.");
  }
}

populateDatabase();
