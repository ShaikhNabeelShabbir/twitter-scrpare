import { fetchTweets, loginToTwitter } from "./twitter-scraper";
import { updateJobState } from "../utils/job-state-helpers";
import {
  saveFetchResult,
  saveInsightSourceTweet,
  upsertInsightSourceFromProfile,
} from "../db/fetch-results";
import { db } from "../db/config";
import { insightSources, insightSourceTweets } from "../db/schema";
import * as Sentry from "@sentry/node";
import {
  getEligibleAccount,
  incrementFailureCount,
  setCooldown,
  burnAccount,
} from "./account-manager";
import { getPasswordFromCreds } from "../utils/hash-password";
import { getExponentialCooldown } from "./account-flow";

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
      // Removed: console.log(`[INFO] Fetched ${tweets.length} tweets. Sample:`, tweets);
      // Removed: console.log("length of tweets", tweets.length);
    } else {
      // Removed: console.log(`[INFO] No tweets fetched for user: ${username}`);
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
  let totalTweets = 0;
  let count = 0;
  const skippedSources = [];
  for (const source of sources) {
    count++;
    let attempt = 0;
    let success = false;
    let lastError = null;
    let usedAccounts = new Set();
    let timedOut = false;
    const scrapePromise = (async () => {
      while (attempt < 3 && !success) {
        const account = await getEligibleAccount(client);
        if (!account) {
          break;
        }
        if (usedAccounts.has(account.id)) {
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
          const tweets = await fetchTweets(
            scraper,
            source.username,
            tweetLimit
          );
          // Batch insert tweets
          if (tweets.length > 0) {
            const tweetRecords = tweets.map((tweet: any) => {
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
              return {
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
            });
            await db
              .insert(insightSourceTweets)
              .values(tweetRecords)
              .onConflictDoNothing();
            totalTweets += tweetRecords.length;
          }
          success = true;
        } catch (error) {
          lastError = error;
          const newFailureCount = await incrementFailureCount(
            client,
            account.id
          );
          const cooldownMinutes = getExponentialCooldown(newFailureCount);
          await setCooldown(client, account.id, cooldownMinutes);
          if (newFailureCount >= 3) {
            await burnAccount(client, account.id);
          }
        }
      }
    })();
    // Timeout logic: skip source if it takes longer than 2 minutes
    await Promise.race([
      scrapePromise,
      new Promise((resolve) =>
        setTimeout(() => {
          timedOut = true;
          resolve(undefined);
        }, 2 * 60 * 1000)
      ),
    ]);
    if (timedOut) {
      skippedSources.push(source);
      continue;
    }
    if (!success) {
      // Only log fatal error for this source
      continue;
    }
  }
  // Retry skipped sources at the end
  for (const source of skippedSources) {
    // Same logic as above, but only one attempt and no further retry if timeout
    let attempt = 0;
    let success = false;
    let usedAccounts = new Set();
    let timedOut = false;
    const scrapePromise = (async () => {
      while (attempt < 3 && !success) {
        const account = await getEligibleAccount(client);
        if (!account) {
          break;
        }
        if (usedAccounts.has(account.id)) {
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
          const tweets = await fetchTweets(
            scraper,
            source.username,
            tweetLimit
          );
          if (tweets.length > 0) {
            const tweetRecords = tweets.map((tweet: any) => {
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
              return {
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
            });
            await db
              .insert(insightSourceTweets)
              .values(tweetRecords)
              .onConflictDoNothing();
            totalTweets += tweetRecords.length;
          }
          success = true;
        } catch (error) {
          // Only log fatal error for this source
        }
      }
    })();
    await Promise.race([
      scrapePromise,
      new Promise((resolve) =>
        setTimeout(() => {
          timedOut = true;
          resolve(undefined);
        }, 2 * 60 * 1000)
      ),
    ]);
  }
}
