# Use official Node.js 18 Alpine image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies first (for better caching)
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the application
COPY . .
COPY use-account.json ./

# Build TypeScript code
RUN npm run build || true

# Set environment variables
ENV NODE_ENV=production

# Expose port 3000 (if you run a web server)
EXPOSE 3000

# Use a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Default command (customize as needed)
ENTRYPOINT []
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/db/seed/index.js && node dist/scrapper/twitter-ca.js $TWITTER_USERNAME"] 