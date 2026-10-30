import type http from "node:http";
import { cache } from "./cache";

// Control endpoint used by `caching-proxy clear-cache`.
export const CLEAR_CACHE_PATH = "/__cache";

/**
 * Handles cache-clear requests. Returns true when the request was a clear
 * request (and has been answered), false when it should be proxied.
 */
export function handleClearCacheRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse,
): boolean {
    const pathname =
        (request.url ?? "/").split("?")[0]?.replace(/\/+$/, "") || "/";
    if (pathname !== CLEAR_CACHE_PATH) return false;

    const cleared = cache.size;
    cache.clear();
    console.log(`[cache] cleared ${cleared} entries`);

    const payload = JSON.stringify({ cleared });
    response.writeHead(200, {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(payload)),
        "cache-control": "no-store",
    });
    response.end(payload);
    return true;
}
