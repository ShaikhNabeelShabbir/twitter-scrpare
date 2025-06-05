import { db } from "./config";
import {
  fetchResults,
  NewFetchResult,
  insightSourceTweets,
  insightSources,
} from "./schema";

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

export async function upsertInsightSourceFromProfile(profile: any) {
  if (!profile || !profile.userId) return;
  const record = {
    id: profile.userId,
    name: profile.name || "",
    username: profile.username || "",
    icon: profile.avatar || "",
    bio: profile.biography || "",
    twitterUrl: profile.url || "",
    followersCount: profile.followersCount || 0,
    followingCount: profile.followingCount || 0,
    friendsCount: profile.friendsCount || 0,
    mediaCount: profile.mediaCount || 0,
    isPrivate: profile.isPrivate || false,
    isVerified: profile.isVerified || false,
    likesCount: profile.likesCount || 0,
    listedCount: profile.listedCount || 0,
    location: profile.location || "",
    tweetsCount: profile.tweetsCount || 0,
    isBlueVerified: profile.isBlueVerified || false,
    canDm: profile.canDm || false,
    joined: profile.joined ? new Date(profile.joined) : null,
    website: profile.website || "",
    pinnedTweetIds: profile.pinnedTweetIds || [],
    createdAt: new Date(),
  };
  await db.insert(insightSources).values(record).onConflictDoUpdate({
    target: insightSources.id,
    set: record,
  });
}
