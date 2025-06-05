import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./config";

async function main() {
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
  } catch (err) {
    console.error("Migration failed!");
    console.error(err);
    process.exit(1);
  }
}

main();
