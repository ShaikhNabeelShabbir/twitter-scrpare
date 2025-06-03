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

const MAX_FAILURE_COUNT = parseInt(
  process.env.MAX_FAILURE_COUNT_TWITTER_CA || "3",
  10
);
const MAX_ACTIVE_SCRAPERS = parseInt(
  process.env.MAX_ACTIVE_SCRAPERS || "20",
  10
);

function getExponentialCooldown(
  failureCount: number,
  baseMinutes = 60,
  maxMinutes = 10080
) {
  const cooldown = baseMinutes * Math.pow(2, failureCount - 1);
  return Math.min(cooldown, maxMinutes);
}

export async function runScraperJob(
  scraper: any,
  jobType: string,
  username: string,
  client: any
) {
  const scraperId = uuidv4();
  let currentAccount: UserAccount | null = null;
  let jobState: JobState | null = null;
  let resumeCheckpoint: string | null = null;

  Sentry.addBreadcrumb({
    category: "scraper",
    message: "Job started",
    level: "info",
    data: { scraperId, jobType },
  });

  try {
    // Check global cap on active scrapers
    const activeCount = await getActiveScraperCount(client);
    if (activeCount >= MAX_ACTIVE_SCRAPERS) {
      Sentry.captureMessage("Max active scrapers reached", "warning");
      return;
    }
    Sentry.addBreadcrumb({
      category: "scraper",
      message: "Selecting eligible account",
      level: "info",
    });
    currentAccount = await getEligibleAccount(client);
    if (!currentAccount) {
      Sentry.captureMessage("No eligible accounts found", "info");
      return;
    }
    Sentry.addBreadcrumb({
      category: "scraper",
      message: "Account selected",
      level: "info",
      data: { accountId: currentAccount.id },
    });
    await registerScraper(client, scraperId, currentAccount.id);
    await setAccountStatus(client, currentAccount.id, "active");
    // Check for incomplete job
    const foundJobState = await getIncompleteJob(
      client,
      scraperId,
      currentAccount.id,
      jobType
    );
    if (foundJobState && foundJobState.last_checkpoint) {
      jobState = foundJobState;
      resumeCheckpoint = jobState.last_checkpoint;
      Sentry.addBreadcrumb({
        category: "scraper",
        message: `Resuming job from checkpoint: ${resumeCheckpoint}`,
        level: "info",
      });
    } else {
      jobState = await createJobState(client, {
        scraper_id: scraperId,
        account_id: currentAccount.id,
        job_type: jobType,
        last_checkpoint: null,
        status: "running",
      });
      Sentry.addBreadcrumb({
        category: "scraper",
        message: `Created new job state: ${jobState.job_id}`,
        level: "info",
      });
    }
    // Generate password
    Sentry.addBreadcrumb({
      category: "scraper",
      message: "Generating password",
      level: "info",
    });
    const password = await getPasswordFromCreds({
      username: currentAccount.username,
      email: currentAccount.email,
    });
    // Login
    Sentry.addBreadcrumb({
      category: "scraper",
      message: "Logging in to Twitter",
      level: "info",
    });
    await loginToTwitter(
      scraper,
      currentAccount.username,
      password,
      currentAccount.email
    );
    // Fetch profile
    Sentry.addBreadcrumb({
      category: "scraper",
      message: "Fetching profile",
      level: "info",
    });
    const profile = await fetchProfile(scraper, username);
    if (profile) {
      Sentry.addBreadcrumb({
        category: "scraper",
        message: "Profile fetched",
        level: "info",
      });
    }
    await updateJobState(client, jobState.job_id, {
      last_checkpoint: "profile_fetched",
    });
    // Fetch current user
    // const me = await fetchCurrentUser(scraper);
    Sentry.addBreadcrumb({
      category: "scraper",
      message: "Fetching userId by screen name",
      level: "info",
    });
    const userId = await fetchUserIdByScreenName(scraper, username);
    await updateJobState(client, jobState.job_id, {
      last_checkpoint: "me_fetched",
    });

    // Fetch tweets
    Sentry.addBreadcrumb({
      category: "scraper",
      message: "Fetching tweets",
      level: "info",
    });
    let tweets = [];
    try {
      tweets = await fetchTweets(scraper, username, 100);
      Sentry.addBreadcrumb({
        category: "scraper",
        message: `Fetched ${tweets.length} tweets`,
        level: "info",
      });
      // Log the count and a sample of the fetched tweets
      if (tweets.length > 0) {
        console.log(`[INFO] Fetched ${tweets.length} tweets. Sample:`, tweets);
        console.log("length of tweets", tweets.length);
      } else {
        console.log(`[INFO] No tweets fetched for user: ${username}`);
      }
      await updateJobState(client, jobState.job_id, {
        last_checkpoint: "tweets_fetched",
      });
    } catch (tweetError) {
      Sentry.captureException(tweetError, {
        extra: {
          scraperId,
          accountId: currentAccount?.id,
          jobType,
          stage: "fetchTweets",
          error:
            tweetError instanceof Error
              ? tweetError.message
              : String(tweetError),
        },
      });
      // Optionally, you can decide to fail the job here or continue
    }
    // On success, set mapping to idle and reset account
    await updateScraperStatus(client, scraperId, "idle");
    await setAccountStatus(client, currentAccount.id, "idle");
    await resetFailureCount(client, currentAccount.id);
    // Rest the account for 1 day after every successful use
    await setAccountRestUntil(client, currentAccount.id, 1);
    await updateJobState(client, jobState.job_id, { status: "completed" });
    Sentry.captureMessage("Job completed successfully", "info");
  } catch (processingError) {
    Sentry.captureException(processingError, {
      extra: {
        scraperId,
        accountId: currentAccount?.id,
        jobType,
        stage: "runScraperJob",
        error:
          processingError instanceof Error
            ? processingError.message
            : String(processingError),
      },
    });
    await updateScraperStatus(client, scraperId, "cooldown");
    if (currentAccount) {
      const newFailureCount = await incrementFailureCount(
        client,
        currentAccount.id
      );
      const cooldownMinutes = getExponentialCooldown(newFailureCount);
      await setCooldown(client, currentAccount.id, cooldownMinutes);
      if (newFailureCount >= MAX_FAILURE_COUNT) {
        await burnAccount(client, currentAccount.id);
      } else {
        await setAccountStatus(client, currentAccount.id, "idle");
      }
    }
    if (jobState) {
      await updateJobState(client, jobState.job_id, {
        status: "failed",
        error_message:
          processingError instanceof Error
            ? processingError.message
            : String(processingError),
      });
    }
  }
}
