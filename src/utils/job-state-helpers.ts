import { Client } from "pg";
import * as dotenv from "dotenv";
import * as Sentry from "@sentry/node";

dotenv.config();

const DB_USER = process.env.DB_USER || "postgres";
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_NAME = process.env.DB_NAME || "mydb";
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_PORT = process.env.DB_PORT || "5432";

const DB_URL = `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

export interface JobState {
  job_id: string;
  scraper_id: string;
  account_id: string;
  job_type: string;
  last_checkpoint: string | null;
  status: string;
  error_message?: string | null;
  started_at?: string;
  updated_at?: string;
}

export async function createJobState({
  scraper_id,
  account_id,
  job_type,
  last_checkpoint,
  status,
}: {
  scraper_id: string;
  account_id: string;
  job_type: string;
  last_checkpoint: string | null;
  status: string;
}): Promise<JobState> {
  const client = new Client({ connectionString: DB_URL });
  try {
    await client.connect();
    const res = await client.query(
      `INSERT INTO scraper_job_state (scraper_id, account_id, job_type, last_checkpoint, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *;`,
      [scraper_id, account_id, job_type, last_checkpoint, status]
    );
    return res.rows[0];
  } catch (error) {
    Sentry.captureException(error, {
      extra: {
        function: "createJobState",
        scraper_id,
        account_id,
        job_type,
      },
    });
    throw error;
  } finally {
    await client.end();
  }
}

export async function updateJobState(
  job_id: string,
  updates: Partial<Omit<JobState, "job_id">>
): Promise<JobState> {
  const client = new Client({ connectionString: DB_URL });
  try {
    await client.connect();
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");
    const query = `UPDATE scraper_job_state SET ${setClause}, updated_at = NOW() WHERE job_id = $${
      fields.length + 1
    } RETURNING *;`;
    const res = await client.query(query, [...values, job_id]);
    return res.rows[0];
  } catch (error) {
    Sentry.captureException(error, {
      extra: {
        function: "updateJobState",
        job_id,
      },
    });
    throw error;
  } finally {
    await client.end();
  }
}

export async function getJobState(
  job_id: string
): Promise<JobState | undefined> {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  const res = await client.query(
    `SELECT * FROM scraper_job_state WHERE job_id = $1;`,
    [job_id]
  );
  await client.end();
  return res.rows[0];
}

export async function getIncompleteJob(
  scraper_id: string,
  account_id: string,
  job_type: string
): Promise<JobState | undefined> {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  const res = await client.query(
    `SELECT * FROM scraper_job_state WHERE scraper_id = $1 AND account_id = $2 AND job_type = $3 AND status IN ('running', 'failed') ORDER BY updated_at DESC LIMIT 1;`,
    [scraper_id, account_id, job_type]
  );
  await client.end();
  return res.rows[0];
}
