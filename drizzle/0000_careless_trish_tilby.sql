CREATE TABLE "fetch_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now(),
	"data_raw" text NOT NULL,
	"data_parsed" text,
	"proxy_used" boolean NOT NULL,
	"duration_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insight_source_tweets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tweet_id" text NOT NULL,
	"tweet_text" text NOT NULL,
	"tweet_url" text NOT NULL,
	"tweet_author_id" text NOT NULL,
	"tweet_images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tweet_videos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tweet_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tweet_images_descriptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tweet_links_descriptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tweet_created_at" timestamp (3) with time zone NOT NULL,
	"last_tweet_images_processed_at" timestamp (3) with time zone,
	"last_tweet_links_processed_at" timestamp (3) with time zone,
	"is_pushed_to_auto_rag" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insight_source_tweets_tweet_id_unique" UNIQUE("tweet_id")
);
--> statement-breakpoint
CREATE TABLE "insight_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"icon" text NOT NULL,
	"bio" text NOT NULL,
	"twitter_url" text NOT NULL,
	"followers_count" integer DEFAULT 0 NOT NULL,
	"following_count" integer DEFAULT 0 NOT NULL,
	"friends_count" integer DEFAULT 0 NOT NULL,
	"media_count" integer DEFAULT 0 NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"listed_count" integer DEFAULT 0 NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"tweets_count" integer DEFAULT 0 NOT NULL,
	"is_blue_verified" boolean DEFAULT false NOT NULL,
	"can_dm" boolean DEFAULT false NOT NULL,
	"joined" timestamp (3) with time zone,
	"website" text DEFAULT '' NOT NULL,
	"pinned_tweet_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insight_sources_username_unique" UNIQUE("username"),
	CONSTRAINT "insight_sources_twitter_url_unique" UNIQUE("twitter_url")
);
--> statement-breakpoint
CREATE TABLE "scraper_job_state" (
	"job_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scraper_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"job_type" text NOT NULL,
	"last_checkpoint" text,
	"status" text NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scraper_mapping" (
	"scraper_id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now(),
	"last_heartbeat" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "twitter_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"is_burned" boolean DEFAULT false,
	"failure_count" integer DEFAULT 0,
	"cooldown_until" timestamp with time zone,
	"rest_until" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"current_status" text DEFAULT 'idle',
	"scraper_started_at" timestamp with time zone,
	CONSTRAINT "twitter_accounts_username_unique" UNIQUE("username"),
	CONSTRAINT "twitter_accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "fetch_results" ADD CONSTRAINT "fetch_results_account_id_twitter_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."twitter_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_source_tweets" ADD CONSTRAINT "insight_source_tweets_tweet_author_id_insight_sources_id_fk" FOREIGN KEY ("tweet_author_id") REFERENCES "public"."insight_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraper_job_state" ADD CONSTRAINT "scraper_job_state_account_id_twitter_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."twitter_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraper_mapping" ADD CONSTRAINT "scraper_mapping_account_id_twitter_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."twitter_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insight_source_tweets_tweet_author_id_idx" ON "insight_source_tweets" USING btree ("tweet_author_id");--> statement-breakpoint
CREATE INDEX "insight_source_tweets_tweet_created_at_idx" ON "insight_source_tweets" USING btree ("tweet_created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "insight_source_tweets_tweet_id_idx" ON "insight_source_tweets" USING btree ("tweet_id");