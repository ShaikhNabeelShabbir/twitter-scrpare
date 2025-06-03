import {
  fetch,
  ProxyAgent,
  setGlobalDispatcher,
  type RequestInfo,
  type RequestInit,
} from "undici";
import {
  Scraper,
  ErrorRateLimitStrategy,
} from "@the-convocation/twitter-scraper";
import * as dotenv from "dotenv";
dotenv.config();

export function createScraperWithProxy(proxyUrl?: string) {
  if (proxyUrl) {
    try {
      setGlobalDispatcher(new ProxyAgent(proxyUrl));
    } catch (err) {
      console.error("[ERROR] Failed to set ProxyAgent:", err);
    }
  }

  return new Scraper({
    rateLimitStrategy: new ErrorRateLimitStrategy(),
    fetch: (async (input: RequestInfo, init: RequestInit) => {
      const response = await fetch(input, {
        ...init,
      });
      if (!response.ok) {
        throw new Error(
          `Response not ok: ${response.status} ${response.statusText}`
        );
      }
      return response;
    }) as unknown as typeof globalThis.fetch,
    transform: {
      response(response) {
        return response;
      },
    },
  });
}

export async function fetchWithProxy(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
  });
  if (!response.ok) {
    throw new Error(
      `Response not ok: ${response.status} ${response.statusText}`
    );
  }
  return response;
}
