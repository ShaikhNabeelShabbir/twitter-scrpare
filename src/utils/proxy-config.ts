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
    rateLimitStrategy: new ErrorRateLimitStrategy(),
    fetch: (async (input: RequestInfo, init: RequestInit) => {
      console.log("[INFO] Fetching:", input, init);
      const response = await fetch(input, {
        ...init,
        ...(agent ? { dispatcher: agent } : {}),
      });
      console.log("[INFO] Response:", {
        url: response.url,
        status: response.status,
        statusText: response.statusText,
      });
      if (!response.ok) {
        console.log("Response not ok, throwing error");
        throw new Error(
          `Response not ok: ${response.status} ${response.statusText}`
        );
      }
      return response;
    }) as unknown as typeof globalThis.fetch,
    transform: {
      response(response) {
        console.log({
          status: response.status,
          statusText: response.statusText,
          headers: JSON.stringify(response.headers, null, 2),
        });
        return response;
      },
    },
  });
}
