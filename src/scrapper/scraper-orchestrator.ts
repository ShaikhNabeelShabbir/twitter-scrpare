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

async function selectAndLoginAccount(
  scraper: any,
  client: any,
  jobType: string,
  maxAttempts: number
) {
  let currentAccount = null;
  let jobState = null;
  let resumeCheckpoint = null;
  let loginSuccess = false;
  let attempts = 0;
  while (!loginSuccess && attempts < maxAttempts) {
    Sentry.addBreadcrumb({
      category: "scraper",
      message: "Selecting eligible account",
      level: "info",
    });
    currentAccount = await getEligibleAccount(client);
    if (!currentAccount) {
      Sentry.captureMessage("No eligible accounts found", "info");
      return { currentAccount: null, jobState: null, resumeCheckpoint: null };
    }
    Sentry.addBreadcrumb({
      category: "scraper",
      message: "Account selected",
      level: "info",
      data: { accountId: currentAccount.id },
    });
    await registerScraper(client, uuidv4(), currentAccount.id);
    await setAccountStatus(client, currentAccount.id, "active");
    // Check for incomplete job
    const foundJobState = await getIncompleteJob(
      client,
      uuidv4(),
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
        scraper_id: uuidv4(),
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
    try {
      await loginToTwitter(
        scraper,
        currentAccount.username,
        password,
        currentAccount.email
      );
      loginSuccess = true;
    } catch (loginError) {
      Sentry.captureException(loginError, {
        extra: { accountId: currentAccount.id },
      });
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
      attempts++;
      continue; // Try next account
    }
  }
  return { currentAccount, jobState, resumeCheckpoint };
}

async function handleJobState(
  scraper: any,
  username: string,
  client: any,
  jobState: any
) {
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
  if (jobState) {
    await updateJobState(client, jobState.job_id, {
      last_checkpoint: "profile_fetched",
    });
  }
  Sentry.addBreadcrumb({
    category: "scraper",
    message: "Fetching userId by screen name",
    level: "info",
  });
  const userId = await fetchUserIdByScreenName(scraper, username);
  if (jobState) {
    await updateJobState(client, jobState.job_id, {
      last_checkpoint: "me_fetched",
    });
  }
}

async function fetchAndStoreTweets(
  scraper: any,
  username: string,
  client: any,
  jobState: any
) {
  Sentry.addBreadcrumb({
    category: "scraper",
    message: "Fetching tweets",
    level: "info",
  });
  let tweets = [];
  try {
    tweets = await fetchTweets(scraper, username, 1000);
    Sentry.addBreadcrumb({
      category: "scraper",
      message: `Fetched ${tweets.length} tweets`,
      level: "info",
    });
    if (tweets.length > 0) {
      console.log(`[INFO] Fetched ${tweets.length} tweets. Sample:`, tweets);
      console.log("length of tweets", tweets.length);
    } else {
      console.log(`[INFO] No tweets fetched for user: ${username}`);
    }
    if (jobState) {
      await updateJobState(client, jobState.job_id, {
        last_checkpoint: "tweets_fetched",
      });
    }
  } catch (tweetError) {
    Sentry.captureException(tweetError, {
      extra: {
        jobType: "fetchTweets",
        error:
          tweetError instanceof Error ? tweetError.message : String(tweetError),
      },
    });
  }
  return tweets;
}

async function handleAccountFailure(
  client: any,
  scraperId: string,
  currentAccount: any,
  jobState: any,
  error: any
) {
  Sentry.captureException(error, {
    extra: {
      scraperId,
      accountId: currentAccount?.id,
      jobType: "runScraperJob",
      stage: "runScraperJob",
      error: error instanceof Error ? error.message : String(error),
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
      error_message: error instanceof Error ? error.message : String(error),
    });
  }
}

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
  const activeCount = await getActiveScraperCount(client);
  if (activeCount >= MAX_ACTIVE_SCRAPERS) {
    Sentry.captureMessage("Max active scrapers reached", "warning");
    return;
  }
  let currentAccount, jobState, resumeCheckpoint;
  try {
    ({ currentAccount, jobState, resumeCheckpoint } =
      await selectAndLoginAccount(scraper, client, jobType, 20));
    if (!currentAccount) return;
    await handleJobState(scraper, username, client, jobState);
    await fetchAndStoreTweets(scraper, username, client, jobState);
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
