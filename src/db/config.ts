import * as dotenv from "dotenv";
dotenv.config();

const requiredVars = [
  "DB_USER",
  "DB_HOST",
  "DB_NAME",
  "DB_PASSWORD",
  "DB_PORT",
];
for (const v of requiredVars) {
  if (!process.env[v]) {
    throw new Error(`Missing required environment variable: ${v}`);
  }
}

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || "5432"),
});

export const db = drizzle(pool, { schema });
