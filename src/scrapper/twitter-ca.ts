import { runScraperJob } from "./scraper-orchestrator";
import { createScraperWithProxy } from "../utils/proxy-config";

async function main() {
  console.log("[INFO] Starting twitter-ca.ts script execution...");
  const proxyUrl = process.env.PROXY_URL;
  const scraper = createScraperWithProxy(proxyUrl);
  await runScraperJob(scraper, "twitter_profile");
  console.log("[INFO] twitter-ca.ts script execution finished.");
}

main().catch((error) => {
  console.error("[ERROR] Fatal error in main execution:", error);
  process.exit(1);
});
