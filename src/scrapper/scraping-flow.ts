import { fetchTweets } from "./twitter-scraper";
import { updateJobState } from "../utils/job-state-helpers";
import { saveFetchResult } from "../db/fetch-results";
import { NewFetchResult } from "../db/schema";
import * as Sentry from "@sentry/node";

export async function fetchAndStoreTweets(
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

export async function saveScrapingResult({
  accountId,
  profile,
  tweets,
  proxyUsed,
  durationMs,
}: {
  accountId: string;
  profile: any;
  tweets: any[];
  proxyUsed: boolean;
  durationMs: number;
}) {
  const fetchResult: NewFetchResult = {
    accountId,
    fetchedAt: new Date(),
    dataRaw: JSON.stringify({ profile, tweets }),
    dataParsed: JSON.stringify({ profile, tweets }),
    proxyUsed,
    durationMs,
  };
  await saveFetchResult(fetchResult);
}
