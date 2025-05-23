import { Scraper } from "agent-twitter-client";
import { runScraperJob } from "./scraper-orchestrator";

async function main() {
  console.log("[INFO] Starting twitter-ca.ts script execution...");
  const proxyUrl = process.env.PROXY_URL;
  if (proxyUrl) {
    // Mask password in logs
    const maskedProxyUrl = proxyUrl.replace(/:(.*?)@/, ":****@");
    console.log(`[INFO] Proxy URL detected: ${maskedProxyUrl}`);
    // If Scraper supports proxy config, you would pass it here
    // For now, just log that we would use it
    // const scraper = new Scraper({ proxy: proxyUrl });
    console.log("[INFO] Scraper would be initialized with proxy.");
  } else {
    console.log(
      "[INFO] No proxy URL detected. Scraper will run without proxy."
    );
  }
  const scraper = new Scraper();
  await runScraperJob(scraper, "twitter_profile");
  console.log("[INFO] twitter-ca.ts script execution finished.");
}

main();
