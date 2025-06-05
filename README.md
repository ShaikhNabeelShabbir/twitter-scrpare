# X Bulk Scraping Application

## Overview

This project is a highly-scalable, persisted bulk scraping system designed for robust, concurrent scraping of platforms like Twitter. It features secure credential management, dynamic scraper mapping, error handling with exponential cooldowns, and extensible architecture for future enhancements such as proxy support and observability.

## Features

- **Secure Credential Handling:** Credentials (username, email) are loaded into the database. Passwords are never stored; they are generated on the fly using Argon2 with deterministic salt and secret.
- **Randomized Account Selection:** Each scraper run picks a random eligible account, ensuring fair distribution and reducing detection risk.
- **Persisted Scraper Mapping:** Active scrapers and their assigned accounts are tracked in a dedicated `scraper_mapping` table, preventing duplicate usage and enabling robust concurrency.
- **Exponential Cooldown:** Accounts that repeatedly fail are put into exponentially increasing cooldowns, reducing the risk of bans.
- **Error Handling:** Comprehensive error handling and logging at every stage.
- **Account State Management:** Accounts can be marked as burned/disabled and are excluded from future runs.
- **Configurable Tweet Fetch Limit:** The number of tweets fetched per account is now configurable, allowing you to control the volume of data retrieved per run.
- **Modular Orchestrator:** The main scraper orchestrator is now split into smaller, focused modules for account management, job state management, and scraping logic, improving maintainability and extensibility.

## Architecture Highlights

- **Database-Driven:** All state (accounts, scrapers, cooldowns) is persisted in PostgreSQL.
- **Drizzle ORM:** The project uses [Drizzle ORM](https://orm.drizzle.team/) for type-safe schema management, migrations, and queries. All schema definitions are in TypeScript, and migrations are generated and applied using Drizzle Kit.
- **Efficient Connection Management:** Each scraper job creates a single PostgreSQL client/connection at the start of the run, passed to all database helper functions, and closed only after the job completes.
- **Stateless Scrapers:** Scraper instances are stateless and coordinate via the database.
- **Extensible:** Designed for easy addition of features like proxy support, observability, and advanced account recycling.
- **Highly Modular Scraper Orchestrator:** The orchestrator logic is now split into:
  - `account-flow.ts`: Handles account selection, login, cooldowns, and failure logic.
  - `job-state-flow.ts`: Handles job state creation, updates, and checkpointing.
  - `scraping-flow.ts`: Handles the actual scraping and result storage.
  - `scraper-orchestrator.ts`: High-level orchestration, delegating to the above modules.

## Prerequisites

- Node.js (v18+ recommended)
- PostgreSQL
- npm

## Environment Variables

Create a `.env` file in your project root with the following variables:

```
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_db_name
TWEET_FETCH_LIMIT=1000 # Optional: Set the max number of tweets to fetch per account (default: 1000)
```

> **Note:** The application will throw an error and exit if any of these variables are missing.

## Installation

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd x-bulk-scrapping
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Configure environment variables:**
   - Copy `.env.example` to `.env` and fill in your database credentials and other settings.

## Database Setup (with Drizzle ORM)

1. **Generate migrations from the schema:**
   ```bash
   npm run db:generate
   ```
2. **Apply migrations to your database:**
   ```bash
   npm run db:migrate
   ```
3. **Seed the database with initial data:**

   ```bash
   npm run db:seed
   ```

   - This will read from `use-account.json` and populate the `twitter_accounts` table.

4. **(Optional) Open Drizzle Studio to inspect your DB:**
   ```bash
   npm run db:studio
   ```

## Usage

- **Run a scraper instance:**

  ```bash
  npx ts-node src/scrapper/twitter-ca.ts <twitter_username>
  ```

  or, if running the compiled JavaScript:

  ```bash
  node dist/scrapper/twitter-ca.js <twitter_username>
  ```

  Replace `<twitter_username>` with the actual Twitter handle you want to scrape.

- Multiple scraper instances can be run in parallel; the system will coordinate account usage via the database.

### Configuring Tweet Fetch Limit

- The number of tweets fetched per account is controlled by the `TWEET_FETCH_LIMIT` environment variable (default: 1000).
- You can override this limit in the orchestrator or utility function call if needed.
- Example:
  ```js
  // In scraping-flow.ts
  const tweetLimit = process.env.TWEET_FETCH_LIMIT
    ? parseInt(process.env.TWEET_FETCH_LIMIT, 10)
    : 1000;
  tweets = await fetchTweets(scraper, username, tweetLimit);
  ```

### Troubleshooting Partial Fetches & Rate Limits

- **Why am I not getting all tweets?**
  - Twitter's frontend API and the scraping library may impose their own limits (e.g., 3200 tweets max, or rate limits).
  - If you see fewer tweets than expected, it may be due to:
    - Twitter's internal limits
    - Rate limiting (try using a fresh account or proxy)
    - The account being protected, suspended, or having deleted tweets
    - The `TWEET_FETCH_LIMIT` or function argument being set too low
- **How to debug:**
  - Check logs for errors or warnings
  - Log the last tweet's ID and timestamp for further analysis
  - Review the [@the-convocation/twitter-scraper issues](https://github.com/the-convocation/twitter-scraper/issues) for similar reports

## Docker Usage

You can run the entire system (including database migrations and seeding) using Docker. This is the recommended way for local development or deployment.

### 1. Build the Docker images

```bash
docker-compose build
```

### 2. Run the scraper with a specific Twitter username

Replace `jack` with any Twitter username you want to scrape:

```bash
TWITTER_USERNAME=jack docker-compose up
```

- This will:
  1. Run all database migrations (creating/updating tables as needed)
  2. Seed the database with accounts from `use-account.json`
  3. Start the Twitter scraper for the username you provide

### 3. Stop the containers

```bash
docker-compose down
```

### Notes

- You only need to set the `TWITTER_USERNAME` environment variable at runtime.
- All database setup and seeding is handled automatically on container startup.
- You can change the username and re-run the command to scrape a different user.
- You can set `TWEET_FETCH_LIMIT` in your environment to control the number of tweets fetched per run.

## Project Structure

```
src/
  db/         # Drizzle ORM schema, config, migrations, and seed scripts
  scrapper/   # Scraper logic (uses a single DB client per job)
    account-flow.ts     # Account selection, login, cooldowns, failure logic
    job-state-flow.ts   # Job state creation, updates, checkpointing
    scraping-flow.ts    # Scraping logic and result storage
    scraper-orchestrator.ts # High-level orchestration, delegates to above modules
    ... (other scraper and mapping files)
  utils/      # Utility functions (e.g., password hashing, DB helpers)
  logic/      # (Reserved for business logic modules)
```

## Troubleshooting Drizzle ORM Setup

- **Missing environment variables:** The app will throw an error if any DB env vars are missing.
- **Migrations not applied:** Run `npm run db:generate` then `npm run db:migrate`.
- **Seeding issues:** Ensure your `.env` is correct and `use-account.json` is present and valid.
- **Wrong database:** Check the DB connection info printed by the seed script.

## Extending the System

- **Proxy Support:** Add proxy configuration and usage in the scraper logic.
- **Observability:** Integrate with logging/metrics platforms for deeper insight.
- **Account Recycling:** Implement logic to rest and recycle accounts after use.
- **Further Modularity:** The orchestrator's modular design makes it easy to add new scraping flows, job types, or account management strategies.

## License

MIT

## Maintainers

- [Your Name or Team]
