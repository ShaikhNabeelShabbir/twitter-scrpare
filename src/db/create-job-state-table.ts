import { Client } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const DB_USER = process.env.DB_USER || "postgres";
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_NAME = process.env.DB_NAME || "mydb";
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_PORT = process.env.DB_PORT || "5432";

if (!DB_PASSWORD) {
  console.error(
    "[CRITICAL_ERROR] DB_PASSWORD is not set in the environment variables."
  );
  process.exit(1);
}

const DB_URL = `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

async function createJobStateTable() {
  console.log("[INFO] Starting scraper_job_state table creation script...");
  const client = new Client({ connectionString: DB_URL });

  try {
    await client.connect();
    console.log("[SUCCESS] Connected to the database.");

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS scraper_job_state (
        job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        scraper_id UUID NOT NULL,
        account_id UUID NOT NULL,
        job_type TEXT NOT NULL,
        last_checkpoint TEXT,
        status TEXT NOT NULL,
        error_message TEXT,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    await client.query(createTableQuery);
    console.log("[SUCCESS] scraper_job_state table created or already exists.");
  } catch (error) {
    console.error(
      "[CRITICAL_ERROR] Error creating scraper_job_state table:",
      error
    );
  } finally {
    await client.end();
    console.log("[INFO] Database connection closed.");
  }
}

createJobStateTable();
