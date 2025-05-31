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

## Architecture Highlights

- **Database-Driven:** All state (accounts, scrapers, cooldowns) is persisted in PostgreSQL.
- **Stateless Scrapers:** Scraper instances are stateless and coordinate via the database.
- **Extensible:** Designed for easy addition of features like proxy support, observability, and advanced account recycling.

## Prerequisites

- Node.js (v18+ recommended)
- PostgreSQL
- npm

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

## Database Setup

1. **Create the main accounts table and load credentials:**
   ```bash
   npx ts-node src/db/populate-db.ts
   ```
2. **Create the scraper mapping table:**
   ```bash
   npx ts-node src/db/create-scraper-mapping-table.ts
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

## Configuration

- All configuration is managed via environment variables. See `.env.example` for details.
- Key variables:
  - `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`: PostgreSQL connection
  - `MAX_FAILURE_COUNT_TWITTER_CA`: Max allowed failures before burning an account

## Project Structure

```
src/
  db/         # Database setup and population scripts
  scrapper/   # Scraper logic
  utils/      # Utility functions (e.g., password hashing)
  logic/      # (Reserved for business logic modules)
```

## Extending the System

- **Proxy Support:** Add proxy configuration and usage in the scraper logic.
- **Observability:** Integrate with logging/metrics platforms for deeper insight.
- **Account Recycling:** Implement logic to rest and recycle accounts after use.

## License

MIT

## Maintainers

- [Your Name or Team]
