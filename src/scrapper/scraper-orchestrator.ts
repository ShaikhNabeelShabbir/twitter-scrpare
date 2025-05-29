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

export async function runScraperJob(scraper: any, jobType: string) {
  const MAX_ATTEMPTS = 10; // Prevent infinite loops
  let attempts = 0;
  let jobCompleted = false;
  let lastError = null;

  while (!jobCompleted && attempts < MAX_ATTEMPTS) {
    attempts++;
    const scraperId = uuidv4();
    let currentAccount: UserAccount | null = null;
    let jobState: JobState | null = null;
    let resumeCheckpoint: string | null = null;

    try {
      // Check global cap on active scrapers
      const activeCount = await getActiveScraperCount();
      if (activeCount >= MAX_ACTIVE_SCRAPERS) {
        Sentry.captureMessage("Max active scrapers reached", "warning");
        return;
      }
      Sentry.addBreadcrumb({
        category: "scraper",
        message: "Selecting eligible account",
        level: "info",
      });
      currentAccount = await getEligibleAccount();
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
      await registerScraper(scraperId, currentAccount.id);
      await setAccountStatus(currentAccount.id, "active");
      // Check for incomplete job
      const foundJobState = await getIncompleteJob(
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
        jobState = await createJobState({
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
      const profile = await fetchProfile(scraper, "NabeelShaikh03");
      if (profile) {
        Sentry.addBreadcrumb({
          category: "scraper",
          message: "Profile fetched",
          level: "info",
        });
      }
      await updateJobState(jobState.job_id, {
        last_checkpoint: "profile_fetched",
      });
      // Fetch current user
      // const me = await fetchCurrentUser(scraper);
      Sentry.addBreadcrumb({
        category: "scraper",
        message: "Fetching userId by screen name",
        level: "info",
      });
      const userId = await fetchUserIdByScreenName(scraper, "NabeelShaikh03");
      await updateJobState(jobState.job_id, { last_checkpoint: "me_fetched" });
      // On success, set mapping to idle and reset account
      await updateScraperStatus(scraperId, "idle");
      await setAccountStatus(currentAccount.id, "idle");
      await resetFailureCount(currentAccount.id);
      await setAccountRestUntil(currentAccount.id, 1);
      await updateJobState(jobState.job_id, { status: "completed" });
      Sentry.captureMessage("Job completed successfully", "info");
      jobCompleted = true;
    } catch (processingError) {
      lastError = processingError;
      Sentry.captureException(processingError, {
        extra: {
          accountId: currentAccount?.id,
          jobType,
          stage: "runScraperJob",
          error:
            processingError instanceof Error
              ? processingError.message
              : String(processingError),
        },
      });
      console.error(
        `[ERROR] Error processing Account ID: ${currentAccount?.id} (${currentAccount?.username}):`,
        processingError,
        processingError instanceof Error ? processingError.stack : ""
      );
      if (currentAccount) {
        const newFailureCount = await incrementFailureCount(currentAccount.id);
        const cooldownMinutes = getExponentialCooldown(newFailureCount);
        await setCooldown(currentAccount.id, cooldownMinutes);
        await updateScraperStatus(scraperId, "cooldown");
        if (newFailureCount >= MAX_FAILURE_COUNT) {
          await burnAccount(currentAccount.id);
          console.log(
            `[SUCCESS] Account ID: ${currentAccount.id} (${currentAccount.username}) marked as 'burned' in database.`
          );
        } else {
          await setAccountStatus(currentAccount.id, "idle");
          console.log(
            `[SUCCESS] Account ID: ${currentAccount.id} (${currentAccount.username}) status set to 'idle' in database after error.`
          );
        }
      }
      if (jobState) {
        await updateJobState(jobState.job_id, {
          status: "failed",
          error_message:
            processingError instanceof Error
              ? processingError.message
              : String(processingError),
        });
      }
      // Continue to next eligible account
    }
  }
  if (!jobCompleted && lastError) {
    throw lastError;
  }
}
