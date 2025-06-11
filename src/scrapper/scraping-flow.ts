import { fetchTweets, loginToTwitter } from "./twitter-scraper";
import { updateJobState } from "../utils/job-state-helpers";
import {
  saveFetchResult,
  saveInsightSourceTweet,
  upsertInsightSourceFromProfile,
} from "../db/fetch-results";
import { db } from "../db/config";
import { insightSources } from "../db/schema";
import * as Sentry from "@sentry/node";
import { getEligibleAccount } from "./account-manager";
import { getPasswordFromCreds } from "../utils/hash-password";

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
  const fetchResult = {
    accountId,
    fetchedAt: new Date(),
    dataRaw: JSON.stringify({ profile, tweets }),
    dataParsed: JSON.stringify({ profile, tweets }),
    proxyUsed,
    durationMs,
  };
  await saveFetchResult(fetchResult);
  if (profile) {
    await upsertInsightSourceFromProfile(profile);
  }
}

export async function scrapeAndStoreInsightSourceTweets(
  scraper: any,
  tweetLimit = 20,
  client: any
) {
  // Fetch all insight sources
  const sources = await db.select().from(insightSources);
  console.log(`[INFO] Found ${sources.length} insight sources to scrape.`);
  let totalTweets = 0;
  let count = 0;
  for (const source of sources) {
    count++;
    let attempt = 0;
    let success = false;
    let lastError = null;
    let usedAccounts = new Set();
    while (attempt < 3 && !success) {
      const account = await getEligibleAccount(client);
      if (!account) {
        console.error(`[ERROR] No eligible accounts available for retry.`);
        break;
      }
      if (usedAccounts.has(account.id)) {
        // Avoid retrying same account in this loop
        attempt++;
        continue;
      }
      usedAccounts.add(account.id);
      const password = await getPasswordFromCreds({
        username: account.username,
        email: account.email,
      });
      try {
        await loginToTwitter(
          scraper,
          account.username,
          password,
          account.email
        );
        console.log(
          `[INFO] [${attempt + 1}/3] Using account: @${
            account.username
          } to scrape @${source.username}`
        );
        const tweets = await fetchTweets(scraper, source.username, tweetLimit);
        for (const tweet of tweets) {
          const tweetImagesDescriptions = (tweet.photos || []).map(
            (photo: any) => ({
              url: photo.url,
              description: photo.alt_text || "",
            })
          );
          const tweetLinksDescriptions = (tweet.urls || []).map(
            (urlObj: any) => ({
              url: urlObj.expanded_url || urlObj.url,
              description: urlObj.title || urlObj.description || "",
            })
          );
          const tweetRecord = {
            tweetId: tweet.id,
            tweetText: tweet.text,
            tweetUrl: tweet.permanentUrl,
            tweetAuthorId: source.id,
            tweetPhotos:
              tweet.photos?.map((photo: any) => ({
                id: photo.id,
                url: photo.url,
              })) ?? [],
            tweetVideos:
              tweet.videos?.map((video: any) => ({
                id: video.id,
                url: tweet.url ?? "",
              })) ?? [],
            tweetUrls: tweet.urls ?? [],
            tweetImagesDescriptions,
            tweetLinksDescriptions,
            tweetCreatedAt: new Date(tweet.timeParsed),
            lastTweetImagesProcessedAt: null,
            lastTweetLinksProcessedAt: null,
            isPushedToAutoRag: false,
            createdAt: new Date(),
          };
          await saveInsightSourceTweet(tweetRecord);
          totalTweets++;
        }
        console.log(
          `[INFO] Saved ${tweets.length} tweets for @${source.username}`
        );
        success = true;
      } catch (error) {
        lastError = error;
        const now = new Date().toISOString();
        console.error(
          `[ERROR] [${now}] Failed to scrape @${source.username} with @${account.username}:`,
          error
        );
        if (error && typeof error === "object") {
          if ("message" in error) {
            console.error(
              `[ERROR] [${now}] error.message:`,
              (error as any).message
            );
          }
          if ("stack" in error) {
            console.error(
              `[ERROR] [${now}] error.stack:`,
              (error as any).stack
            );
          }
          if ("status" in error) {
            console.error(
              `[ERROR] [${now}] error.status:`,
              (error as any).status
            );
          }
          if ("response" in error) {
            console.error(
              `[ERROR] [${now}] error.response:`,
              (error as any).response
            );
          }
          for (const key of Object.keys(error)) {
            if (!["message", "stack", "status", "response"].includes(key)) {
              console.error(
                `[ERROR] [${now}] error[${key}]:`,
                (error as any)[key]
              );
            }
          }
        }
        Sentry.captureException(error, {
          extra: { username: source.username, account: account.username },
        });
        attempt++;
      }
    }
    if (!success) {
      console.error(
        `[FATAL] Could not scrape @${source.username} with any eligible account. Last error:`,
        lastError
      );
    }
  }
  console.log(`[INFO] Finished scraping. Total tweets saved: ${totalTweets}`);
}
