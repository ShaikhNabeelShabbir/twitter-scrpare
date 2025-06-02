import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
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

export type TwitterAccount = typeof twitterAccounts.$inferSelect;
export type NewTwitterAccount = typeof twitterAccounts.$inferInsert;

export type ScraperMapping = typeof scraperMapping.$inferSelect;
export type NewScraperMapping = typeof scraperMapping.$inferInsert;

export type ScraperJobState = typeof scraperJobState.$inferSelect;
export type NewScraperJobState = typeof scraperJobState.$inferInsert;
