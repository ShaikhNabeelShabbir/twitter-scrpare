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
    try {
      agent = new ProxyAgent(proxyUrl);
      setGlobalDispatcher(agent);
      console.log("[INFO] ProxyAgent successfully set as global dispatcher.");
    } catch (err) {
      console.error("[ERROR] Failed to set ProxyAgent:", err);
    }
  } else {
    console.log(
      "[INFO] No proxy URL provided. Requests will be made directly."
    );
  }

  return new Scraper({
    fetch: (async (input: RequestInfo, init: RequestInit) => {
      if (agent) {
        console.log("[DEBUG] Dispatching request through proxy agent.");
      } else {
        console.log("[DEBUG] Dispatching request without proxy agent.");
      }
      console.log("[INFO] Fetching:", input);
      return fetch(input, {
        ...init,
        ...(agent ? { dispatcher: agent } : {}),
      })
        .then((response) => {
          console.log("[INFO] Response status:", response.status);
          return response;
        })
        .catch((error) => {
          console.error(
            "[ERROR] Fetch error (proxy may be misconfigured):",
            error
          );
          throw error;
        });
    }) as unknown as typeof globalThis.fetch,
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
