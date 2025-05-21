import { Client } from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const DB_USER = process.env.DB_USER || "postgres";
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_NAME = process.env.DB_NAME || "mydb";
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_PORT = process.env.DB_PORT || "5432";
const DB_TABLE_NAME = process.env.DB_TABLE_NAME || "twitter_accounts";

export interface UserAccount {
  id: string;
  email: string;
  username: string;
}

const DB_CONNECTION_STRING = `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

export async function getEligibleAccount(): Promise<UserAccount | null> {
  const client = new Client({ connectionString: DB_CONNECTION_STRING });
  await client.connect();
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
  const dbResult = await client.query(selectQuery);
  await client.end();
  if (dbResult.rows.length === 0) return null;
  return dbResult.rows[0] as UserAccount;
}

export async function setAccountStatus(accountId: string, status: string) {
  const client = new Client({ connectionString: DB_CONNECTION_STRING });
  await client.connect();
  await client.query(
    `UPDATE ${DB_TABLE_NAME} SET current_status = $1, scraper_started_at = NOW() WHERE id = $2`,
    [status, accountId]
  );
  await client.end();
}

export async function incrementFailureCount(
  accountId: string
): Promise<number> {
  const client = new Client({ connectionString: DB_CONNECTION_STRING });
  await client.connect();
  const { rows } = await client.query(
    `UPDATE ${DB_TABLE_NAME} SET failure_count = failure_count + 1 WHERE id = $1 RETURNING failure_count;`,
    [accountId]
  );
  await client.end();
  return rows[0]?.failure_count;
}

export async function setCooldown(accountId: string, cooldownMinutes: number) {
  const client = new Client({ connectionString: DB_CONNECTION_STRING });
  await client.connect();
  await client.query(
    `UPDATE ${DB_TABLE_NAME} SET cooldown_until = NOW() + INTERVAL '${cooldownMinutes} minutes' WHERE id = $1`,
    [accountId]
  );
  await client.end();
}

export async function resetFailureCount(accountId: string) {
  const client = new Client({ connectionString: DB_CONNECTION_STRING });
  await client.connect();
  await client.query(
    `UPDATE ${DB_TABLE_NAME} SET failure_count = 0, cooldown_until = NULL WHERE id = $1`,
    [accountId]
  );
  await client.end();
}

export async function burnAccount(accountId: string) {
  const client = new Client({ connectionString: DB_CONNECTION_STRING });
  await client.connect();
  await client.query(
    `UPDATE ${DB_TABLE_NAME} SET is_burned = TRUE, current_status = 'burned', scraper_started_at = NULL WHERE id = $1`,
    [accountId]
  );
  await client.end();
}
