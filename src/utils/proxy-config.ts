import {
  fetch,
  ProxyAgent,
  setGlobalDispatcher,
  type RequestInfo,
  type RequestInit,
} from "undici";
import {
  Scraper,
  WaitingRateLimitStrategy,
} from "@the-convocation/twitter-scraper";

export function createScraperWithProxy(proxyUrl?: string) {
  let agent: ProxyAgent | null = null;

  if (proxyUrl) {
    // Mask password in logs
    const maskedProxyUrl = proxyUrl.replace(/:(.*?)@/, ":****@");
    console.log(`[INFO] Proxy URL detected: ${maskedProxyUrl}`);
    agent = new ProxyAgent(proxyUrl);
    setGlobalDispatcher(agent);
  }

  return new Scraper({
    fetch: (async (input: RequestInfo, init: RequestInit) => {
      console.log("[INFO] Fetching:", input);
      return fetch(input, {
        ...init,
        ...(agent ? { dispatcher: agent } : {}),
      }).then((response) => {
        console.log("[INFO] Response status:", response.status);
        return response;
      });
    }) as typeof globalThis.fetch,
    transform: {
      response(response) {
        console.log({
          status: response.status,
          statusText: response.statusText,
        });
        // No process.exit(1) on 429; let WaitingRateLimitStrategy handle it
        return response;
      },
    },
    rateLimitStrategy: new WaitingRateLimitStrategy(),
  });
}
