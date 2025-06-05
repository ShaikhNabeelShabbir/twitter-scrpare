import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const twitterAccounts = pgTable("twitter_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  isActive: boolean("is_active").default(true),
  isBurned: boolean("is_burned").default(false),
  failureCount: integer("failure_count").default(0),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
  restUntil: timestamp("rest_until", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  currentStatus: text("current_status").default("idle"),
  scraperStartedAt: timestamp("scraper_started_at", { withTimezone: true }),
});

export const scraperMapping = pgTable("scraper_mapping", {
  scraperId: uuid("scraper_id").primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => twitterAccounts.id),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  lastHeartbeat: timestamp("last_heartbeat", {
    withTimezone: true,
  }).defaultNow(),
});

export const scraperJobState = pgTable("scraper_job_state", {
  jobId: uuid("job_id").primaryKey().defaultRandom(),
  scraperId: uuid("scraper_id").notNull(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => twitterAccounts.id),
  jobType: text("job_type").notNull(),
  lastCheckpoint: text("last_checkpoint"),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const fetchResults = pgTable("fetch_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => twitterAccounts.id),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow(),
  dataRaw: text("data_raw").notNull(),
  dataParsed: text("data_parsed"),
  proxyUsed: boolean("proxy_used").notNull(),
  durationMs: integer("duration_ms").notNull(),
});

export const insightSources = pgTable("insight_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  icon: text("icon").notNull(),
  bio: text("bio").notNull(),
  twitterUrl: text("twitter_url").notNull().unique(),
  followersCount: integer("followers_count").notNull().default(0),
  followingCount: integer("following_count").notNull().default(0),
  friendsCount: integer("friends_count").notNull().default(0),
  mediaCount: integer("media_count").notNull().default(0),
  isPrivate: boolean("is_private").notNull().default(false),
  isVerified: boolean("is_verified").notNull().default(false),
  likesCount: integer("likes_count").notNull().default(0),
  listedCount: integer("listed_count").notNull().default(0),
  location: text("location").notNull().default(""),
  tweetsCount: integer("tweets_count").notNull().default(0),
  isBlueVerified: boolean("is_blue_verified").notNull().default(false),
  canDm: boolean("can_dm").notNull().default(false),
  joined: timestamp("joined", {
    mode: "date",
    withTimezone: true,
    precision: 3,
  }),
  website: text("website").notNull().default(""),
  pinnedTweetIds: jsonb("pinned_tweet_ids")
    .$type<string[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", {
    mode: "date",
    withTimezone: true,
    precision: 3,
  })
    .notNull()
    .defaultNow(),
});

export const insightSourceTweets = pgTable(
  "insight_source_tweets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tweetId: text("tweet_id").notNull().unique(),
    tweetText: text("tweet_text").notNull(),
    tweetUrl: text("tweet_url").notNull(),
    tweetAuthorId: text("tweet_author_id")
      .notNull()
      .references(() => insightSources.id, { onDelete: "cascade" }),
    tweetPhotos: jsonb("tweet_images")
      .$type<{ id: string; url: string }[]>()
      .notNull()
      .default([]),
    tweetVideos: jsonb("tweet_videos")
      .$type<{ id: string; url: string }[]>()
      .notNull()
      .default([]),
    tweetUrls: jsonb("tweet_urls").$type<string[]>().notNull().default([]),
    tweetImagesDescriptions: jsonb("tweet_images_descriptions")
      .$type<{ url: string; description: string }[]>()
      .notNull()
      .default([]),
    tweetLinksDescriptions: jsonb("tweet_links_descriptions")
      .$type<{ url: string; description: string }[]>()
      .notNull()
      .default([]),
    tweetCreatedAt: timestamp("tweet_created_at", {
      mode: "date",
      withTimezone: true,
      precision: 3,
    }).notNull(),
    lastTweetImagesProcessedAt: timestamp("last_tweet_images_processed_at", {
      mode: "date",
      withTimezone: true,
      precision: 3,
    }),
    lastTweetLinksProcessedAt: timestamp("last_tweet_links_processed_at", {
      mode: "date",
      withTimezone: true,
      precision: 3,
    }),
    isPushedToAutoRag: boolean("is_pushed_to_auto_rag")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
      precision: 3,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("insight_source_tweets_tweet_author_id_idx").on(table.tweetAuthorId),
    index("insight_source_tweets_tweet_created_at_idx").on(
      table.tweetCreatedAt
    ),
    uniqueIndex("insight_source_tweets_tweet_id_idx").on(table.tweetId),
  ]
);

export type TwitterAccount = typeof twitterAccounts.$inferSelect;
export type NewTwitterAccount = typeof twitterAccounts.$inferInsert;

export type ScraperMapping = typeof scraperMapping.$inferSelect;
export type NewScraperMapping = typeof scraperMapping.$inferInsert;

export type ScraperJobState = typeof scraperJobState.$inferSelect;
export type NewScraperJobState = typeof scraperJobState.$inferInsert;

export type FetchResult = typeof fetchResults.$inferSelect;
export type NewFetchResult = typeof fetchResults.$inferInsert;
