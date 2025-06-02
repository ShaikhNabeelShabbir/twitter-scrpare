import { db } from "../config";
import { twitterAccounts } from "../schema";
import { pool } from "../config";
import * as fs from "fs/promises";

async function seedAccounts() {
  // Log DB connection info
  console.log("Seeding DB:", pool.options);

  const accountsFile = process.env.ACCOUNTS_FILE_PATH || "use-account.json";
  const data = await fs.readFile(accountsFile, "utf-8");
  const accounts = JSON.parse(data);

  console.log(`Parsed ${accounts.length} accounts from ${accountsFile}`);

  if (!accounts.length) {
    console.log("No accounts to seed.");
    return;
  }

  await db
    .insert(twitterAccounts)
    .values(
      accounts.map((a: any) => ({
        username: a.username,
        email: a.email,
        isActive: true,
        isBurned: false,
        failureCount: 0,
        currentStatus: "idle",
      }))
    )
    .onConflictDoNothing();

  // Query and log the number of rows in twitter_accounts
  const allAccounts = await db.select().from(twitterAccounts);
  console.log(`twitter_accounts table now has ${allAccounts.length} rows.`);
}

seedAccounts()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
