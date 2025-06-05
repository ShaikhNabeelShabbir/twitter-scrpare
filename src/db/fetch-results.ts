import { db } from "./config";
import { fetchResults, NewFetchResult, insightSourceTweets } from "./schema";

export async function saveFetchResult(result: NewFetchResult) {
  return db.insert(fetchResults).values(result).returning();
}

export async function saveInsightSourceTweet(tweet: any) {
  return db
    .insert(insightSourceTweets)
    .values(tweet)
    .onConflictDoNothing()
    .returning();
}
