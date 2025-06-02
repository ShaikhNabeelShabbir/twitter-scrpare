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
ALTER TABLE "scraper_job_state" ADD CONSTRAINT "scraper_job_state_account_id_twitter_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."twitter_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraper_mapping" ADD CONSTRAINT "scraper_mapping_account_id_twitter_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."twitter_accounts"("id") ON DELETE no action ON UPDATE no action;