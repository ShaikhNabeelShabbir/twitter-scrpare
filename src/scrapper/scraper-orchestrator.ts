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
  const scraperId = uuidv4();
  let currentAccount: UserAccount | null = null;
  let jobState: JobState | null = null;
  let resumeCheckpoint: string | null = null;

  // Check global cap on active scrapers
  const activeCount = await getActiveScraperCount();
  if (activeCount >= MAX_ACTIVE_SCRAPERS) {
    console.log(
      `[INFO] Max active scrapers (${MAX_ACTIVE_SCRAPERS}) reached. Exiting.`
    );
    return;
  }

  // Select eligible account
  currentAccount = await getEligibleAccount();
  if (!currentAccount) {
    console.log(
      "[INFO] No eligible accounts found in the database at this time. Exiting."
    );
    return;
  }
  console.log(
    `[INFO] Selected Account - Username: ${currentAccount.username}, ID: ${currentAccount.id} for processing.`
  );

  // Register mapping
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
    console.log(`[INFO] Resuming job from checkpoint: ${resumeCheckpoint}`);
  } else {
    jobState = await createJobState({
      scraper_id: scraperId,
      account_id: currentAccount.id,
      job_type: jobType,
      last_checkpoint: null,
      status: "running",
    });
    console.log(`[INFO] Created new job state: ${jobState.job_id}`);
  }

  try {
    // Generate password
    const password = await getPasswordFromCreds({
      username: currentAccount.username,
      email: currentAccount.email,
    });
    // Login
    await loginToTwitter(
      scraper,
      currentAccount.username,
      password,
      currentAccount.email
    );
    // Fetch profile
    const profile = await fetchProfile(scraper, "NabeelShaikh03");
    if (profile) {
      console.log(`[SUCCESS] Profile for NabeelShaikh03 fetched successfully.`);
      console.log(profile);
    }
    await updateJobState(jobState.job_id, {
      last_checkpoint: "profile_fetched",
    });
    // Fetch current user
    // const me = await fetchCurrentUser(scraper);
    const userId = await fetchUserIdByScreenName(scraper, "NabeelShaikh03");
    // if (me) {
    //   console.log(
    //     `[SUCCESS] Current user details (me) fetched successfully. User: ${me.username}`
    //   );
    // }
    await updateJobState(jobState.job_id, { last_checkpoint: "me_fetched" });
    // On success, set mapping to idle and reset account
    await updateScraperStatus(scraperId, "idle");
    await setAccountStatus(currentAccount.id, "idle");
    await resetFailureCount(currentAccount.id);
    await setAccountRestUntil(currentAccount.id, 1);
    await updateJobState(jobState.job_id, { status: "completed" });
  } catch (processingError) {
    console.error(
      `[ERROR] Error processing Account ID: ${currentAccount?.id} (${currentAccount?.username}):`,
      processingError,
      processingError instanceof Error ? processingError.stack : ""
    );
    await updateScraperStatus(scraperId, "cooldown");
    const newFailureCount = await incrementFailureCount(currentAccount.id);
    const cooldownMinutes = getExponentialCooldown(newFailureCount);
    await setCooldown(currentAccount.id, cooldownMinutes);
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
    if (jobState) {
      await updateJobState(jobState.job_id, {
        status: "failed",
        error_message:
          processingError instanceof Error
            ? processingError.message
            : String(processingError),
      });
    }
  }
}
