import { Scraper } from "agent-twitter-client";

export async function loginToTwitter(
  scraper: Scraper,
  username: string,
  password: string,
  email: string
) {
  await scraper.login(username, password, email);
}

export async function fetchProfile(scraper: Scraper, screenName: string) {
  return await scraper.getProfile(screenName);
}

export async function fetchCurrentUser(scraper: Scraper) {
  return await scraper.me();
}

export async function fetchUserIdByScreenName(
  scraper: Scraper,
  screenName: string
) {
  return await scraper.getUserIdByScreenName(screenName);
}
