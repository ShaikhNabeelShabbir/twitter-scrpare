// import { Client } from "pg";
// import * as dotenv from "dotenv";

// dotenv.config();

// const DB_USER = process.env.DB_USER || "postgres";
// const DB_HOST = process.env.DB_HOST || "localhost";
// const DB_NAME = process.env.DB_NAME || "mydb";
// const DB_PASSWORD = process.env.DB_PASSWORD;
// const DB_PORT = process.env.DB_PORT || "5432";

// if (!DB_PASSWORD) {
//   console.error(
//     "[CRITICAL_ERROR] DB_PASSWORD is not set in the environment variables."
//   );
//   process.exit(1);
// }

// const DB_URL = `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

// async function createScraperMappingTable() {
//   console.log("[INFO] Starting scraper_mapping table creation script...");
//   const client = new Client({ connectionString: DB_URL });

//   try {
//     await client.connect();
//     console.log("[SUCCESS] Connected to the database.");

//     const createTableQuery = `
//       CREATE TABLE IF NOT EXISTS scraper_mapping (
//         scraper_id UUID PRIMARY KEY,
//         account_id UUID REFERENCES twitter_accounts(id),
//         status TEXT NOT NULL,
//         last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
//         started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
//       );
//     `;
//     await client.query(createTableQuery);
//     console.log("[SUCCESS] scraper_mapping table created or already exists.");

//     const createIndexQuery = `
//       CREATE INDEX IF NOT EXISTS idx_scraper_mapping_account_id ON scraper_mapping(account_id);
//     `;
//     await client.query(createIndexQuery);
//     console.log("[SUCCESS] Index on account_id created or already exists.");
//   } catch (error) {
//     console.error(
//       "[CRITICAL_ERROR] Error creating scraper_mapping table:",
//       error
//     );
//   } finally {
//     await client.end();
//     console.log("[INFO] Database connection closed.");
//   }
// }

// createScraperMappingTable();
