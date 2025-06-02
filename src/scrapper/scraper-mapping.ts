import { Client } from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const DB_USER = process.env.DB_USER || "postgres";
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_NAME = process.env.DB_NAME || "mydb";
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_PORT = process.env.DB_PORT || "5432";

const DB_CONNECTION_STRING = `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

export async function registerScraper(
  client: Client,
  scraperId: string,
  accountId: string
) {
  await client.query(
    `INSERT INTO scraper_mapping (scraper_id, account_id, status, started_at, last_heartbeat)
     VALUES ($1, $2, 'active', NOW(), NOW())
     ON CONFLICT (scraper_id) DO UPDATE
     SET account_id = $2, status = 'active', started_at = NOW(), last_heartbeat = NOW();`,
    [scraperId, accountId]
  );
}

export async function updateScraperStatus(
  client: Client,
  scraperId: string,
  status: string
) {
  await client.query(
    `UPDATE scraper_mapping SET status = $1, last_heartbeat = NOW() WHERE scraper_id = $2`,
    [status, scraperId]
  );
}

export async function removeScraperMapping(client: Client, scraperId: string) {
  await client.query(`DELETE FROM scraper_mapping WHERE scraper_id = $1`, [
    scraperId,
  ]);
}

export async function getActiveScraperCount(client: Client): Promise<number> {
  const { rows } = await client.query(
    `SELECT COUNT(*) AS active_count FROM scraper_mapping WHERE status = 'active';`
  );
  return parseInt(rows[0].active_count, 10);
}
