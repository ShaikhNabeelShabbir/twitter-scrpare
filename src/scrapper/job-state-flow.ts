import { updateJobState } from "../utils/job-state-helpers";
import { fetchProfile, fetchUserIdByScreenName } from "./twitter-scraper";
import * as Sentry from "@sentry/node";

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

export { handleJobState };
