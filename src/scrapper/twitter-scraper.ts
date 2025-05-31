import { Scraper } from "@the-convocation/twitter-scraper";
import * as Sentry from "@sentry/node";

export async function loginToTwitter(
  scraper: any,
  username: string,
  password: string,
  email: string
) {
  console.log(`[INFO] Attempting login for username: ${username}`);
  try {
    await scraper.login(username, password);
    console.log(`[SUCCESS] Login successful for username: ${username}`);
  } catch (error) {
    Sentry.captureException(error, {
      extra: {
        function: "loginToTwitter",
        username: "[MASKED]",
        email: "[MASKED]",
      },
    });
    console.error(`[ERROR] Login failed for username: ${username}`, error);
    throw error;
  }
}

export async function fetchProfile(scraper: any, screenName: string) {
  console.log(`[INFO] Fetching profile for screenName: ${screenName}`);
  try {
    const profile = await scraper.getProfile(screenName);
    if (profile) {
      console.log(`[SUCCESS] Profile fetched for screenName: ${screenName}`);
      console.log("profile", profile);
    } else {
      console.warn(`[WARN] No profile found for screenName: ${screenName}`);
    }
    return profile;
  } catch (error) {
    Sentry.captureException(error, {
      extra: {
        function: "fetchProfile",
        screenName,
      },
    });
    console.error(
      `[ERROR] Failed to fetch profile for screenName: ${screenName}`,
      error
    );
    throw error;
  }
}

// export async function fetchCurrentUser(scraper: any) {
//   console.log(`[INFO] Fetching current user (me)`);
//   try {
//     const me = await scraper.me();
//     if (me) {
//       console.log(`[SUCCESS] Current user fetched: ${me.username || me.id}`);
//     } else {
//       console.warn(`[WARN] No current user found.`);
//     }
//     return me;
//   } catch (error) {
//     console.error(`[ERROR] Failed to fetch current user`, error);
//     throw error;
//   }
// }

export async function fetchUserIdByScreenName(
  scraper: any,
  screenName: string
) {
  console.log(`[INFO] Fetching user ID for screenName: ${screenName}`);
  try {
    const user = await scraper.getProfile(screenName);
    const userId = user?.rest_id || user?.id;
    if (userId) {
      console.log(`[SUCCESS] User ID for screenName ${screenName}: ${userId}`);
    } else {
      console.warn(`[WARN] No user ID found for screenName: ${screenName}`);
    }
    return userId;
  } catch (error) {
    Sentry.captureException(error, {
      extra: {
        function: "fetchUserIdByScreenName",
        screenName,
      },
    });
    console.error(
      `[ERROR] Failed to fetch user ID for screenName: ${screenName}`,
      error
    );
    throw error;
  }
}
