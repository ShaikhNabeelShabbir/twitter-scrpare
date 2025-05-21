import { Scraper } from "agent-twitter-client";
import { runScraperJob } from "./scraper-orchestrator";

async function main() {
  console.log("[INFO] Starting twitter-ca.ts script execution...");
  const scraper = new Scraper();
  await runScraperJob(scraper, "twitter_profile");
  console.log("[INFO] twitter-ca.ts script execution finished.");
}

main();
