import { v4 as uuidv4 } from "uuid";
import {
  getEligibleAccount,
  setAccountStatus,
  incrementFailureCount,
  setCooldown,
  resetFailureCount,
  burnAccount,
  setAccountRestUntil,
  UserAccount,
} from "./account-manager";
import {
  registerScraper,
  updateScraperStatus,
  getActiveScraperCount,
} from "./scraper-mapping";
import {
  createJobState,
  updateJobState,
  getIncompleteJob,
  JobState,
} from "../utils/job-state-helpers";
import { getPasswordFromCreds } from "../utils/hash-password";
import {
  loginToTwitter,
  fetchProfile,
  // fetchCurrentUser,
  fetchUserIdByScreenName,
  fetchTweets,
} from "./twitter-scraper";
import * as Sentry from "@sentry/node";
import { saveFetchResult } from "../db/fetch-results";
import { NewFetchResult } from "../db/schema";
import {
  getExponentialCooldown,
  selectAndLoginAccount,
  handleAccountFailure,
} from "./account-flow";
import { handleJobState } from "./job-state-flow";
import { fetchAndStoreTweets, saveScrapingResult } from "./scraping-flow";

const MAX_FAILURE_COUNT = parseInt(
  process.env.MAX_FAILURE_COUNT_TWITTER_CA || "3",
  10
);
const MAX_ACTIVE_SCRAPERS = parseInt(
  process.env.MAX_ACTIVE_SCRAPERS || "20",
  10
);

export async function runScraperJob(
  scraper: any,
  jobType: string,
  username: string,
  client: any
) {
  const scraperId = uuidv4();
  Sentry.addBreadcrumb({
    category: "scraper",
    message: "Job started",
    level: "info",
    data: { scraperId, jobType },
  });
  let currentAccount, jobState, resumeCheckpoint;
  const fetchStart = Date.now();
  try {
    ({ currentAccount, jobState, resumeCheckpoint } =
      await selectAndLoginAccount(scraper, client, jobType, 20));
    if (!currentAccount) return;
    await handleJobState(scraper, username, client, jobState);
    const profile = await scraper.getProfile(username);
    const tweets = await fetchAndStoreTweets(
      scraper,
      username,
      client,
      jobState
    );
    const fetchEnd = Date.now();
    if (profile) {
      await saveScrapingResult({
        accountId: currentAccount.id,
        profile,
        tweets,
        proxyUsed: !!process.env.PROXY_URL,
        durationMs: fetchEnd - fetchStart,
      });
    }
    if (currentAccount) {
      await updateScraperStatus(client, scraperId, "idle");
      await setAccountStatus(client, currentAccount.id, "idle");
      await resetFailureCount(client, currentAccount.id);
      await setAccountRestUntil(client, currentAccount.id, 1);
    }
    if (jobState) {
      await updateJobState(client, jobState.job_id, { status: "completed" });
    }
    Sentry.captureMessage("Job completed successfully", "info");
  } catch (processingError) {
    await handleAccountFailure(
      client,
      scraperId,
      currentAccount,
      jobState,
      processingError
    );
  }
}
