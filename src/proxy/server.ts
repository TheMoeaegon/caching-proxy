import http from "node:http";
import {
    ageSeconds,
    buildKey,
    createEntry,
    getCache,
    isCacheable,
    parseInitialAge,
    revalidate,
    store,
} from "./cache";
import {
    clientResponseHeaders,
    SERVER_NAME,
    upstreamRequestHeaders,
} from "./headers";
import { prepareBody } from "./body";
import type { CacheEntry } from "../types";

function headerValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value.join(", ") : value;
}

function normalizedEtag(tag: string): string {
    return tag.trim().replace(/^W\//, "");
}

function clientCacheMatches(
    request: http.IncomingMessage,
    entry: CacheEntry,
): boolean {
    const ifNoneMatch = headerValue(request.headers["if-none-match"]);
    if (ifNoneMatch !== undefined) {
        const etag = entry.headers.get("etag");
        if (!etag) return false;
        if (ifNoneMatch.trim() === "*") return true;

        const stored = normalizedEtag(etag);
        return ifNoneMatch
            .split(",")
            .some((candidate) => normalizedEtag(candidate) === stored);
    }

    const ifModifiedSince = headerValue(request.headers["if-modified-since"]);
    if (ifModifiedSince !== undefined) {
        const lastModified = entry.headers.get("last-modified");
        if (!lastModified) return false;

        const since = Date.parse(ifModifiedSince);
        const modified = Date.parse(lastModified);
        if (!Number.isFinite(since) || !Number.isFinite(modified)) return false;

        return modified <= since;
    }

    return false;
}

function appendHeaders(response: http.ServerResponse, headers: Headers) {
    for (const [name, value] of headers) {
        if (name.toLowerCase() === "set-cookie") continue;
        response.appendHeader(name, value);
    }

    for (const cookie of headers.getSetCookie()) {
        response.appendHeader("set-cookie", cookie);
    }
}

function writeHeaders(
    response: http.ServerResponse,
    headers: Headers,
    status: number,
    age: number,
    cacheStatus: "HIT" | "MISS",
) {
    const out = new Headers(headers);
    out.set("age", String(age));
    out.set("x-cache", cacheStatus);
    out.set("server", SERVER_NAME);

    appendHeaders(response, out);
    response.statusCode = status;
}

function sendEntry(
    response: http.ServerResponse,
    entry: CacheEntry,
    isHead: boolean,
    cacheStatus: "HIT" | "MISS",
) {
    writeHeaders(
        response,
        entry.headers,
        entry.status,
        ageSeconds(entry),
        cacheStatus,
    );
    response.end(isHead ? undefined : entry.body);
}

function sendNotModified(response: http.ServerResponse, entry: CacheEntry) {
    writeHeaders(response, entry.headers, 304, ageSeconds(entry), "HIT");
    response.end();
}

export function startServer(PORT: number, baseUrl: string) {
    const server = http.createServer(async (request, response) => {
        try {
            const path = request.url ?? "/";
            const u = new URL(path, baseUrl);

            // non-cacheable methods: forward as-is, never store
            if (request.method != "GET" && request.method != "HEAD") {
                const body = await prepareBody(request);
                const res = await fetch(u, {
                    body,
                    method: request.method,
                    headers: upstreamRequestHeaders(request),
                });
                const resBody = new Uint8Array(await res.arrayBuffer());
                const headers = clientResponseHeaders(res.headers);
                headers.set("x-cache", "MISS");

                appendHeaders(response, headers);
                response.statusCode = res.status;
                response.end(resBody);
                return;
            }

            const isHead = request.method === "HEAD";
            const key = buildKey(request);
            const cached = getCache(key);

            if (cached) {
                if (cached.fresh) {
                    if (clientCacheMatches(request, cached.entry)) {
                        sendNotModified(response, cached.entry);
                    } else {
                        sendEntry(response, cached.entry, isHead, "HIT");
                    }
                    return;
                }

                // stale: ask upstream whether our stored copy is still valid
                const result = await revalidate(
                    key,
                    cached.entry,
                    u,
                    upstreamRequestHeaders(request),
                );

                if (result.notModified) {
                    if (clientCacheMatches(request, result.entry)) {
                        sendNotModified(response, result.entry);
                    } else {
                        sendEntry(response, result.entry, isHead, "HIT");
                    }
                } else {
                    sendEntry(response, result.entry, isHead, "MISS");
                }
                return;
            }

            // miss: fetch a full body so it can be stored (drop client validators)
            const requestHeaders = upstreamRequestHeaders(request);
            requestHeaders.delete("if-none-match");
            requestHeaders.delete("if-modified-since");
            requestHeaders.delete("if-match");
            requestHeaders.delete("if-unmodified-since");
            requestHeaders.delete("if-range");

            const res = await fetch(u, {
                method: "GET",
                headers: requestHeaders,
            });
            const body = new Uint8Array(await res.arrayBuffer());
            const headers = clientResponseHeaders(res.headers);
            const initialAge = parseInitialAge(res.headers);

            const entry = isCacheable(res.status, headers)
                ? store(key, body, headers, res.status, initialAge)
                : createEntry(body, headers, res.status, initialAge);

            sendEntry(response, entry, isHead, "MISS");
        } catch (error) {
            console.error(error);
            if (!response.headersSent) {
                response.statusCode = 502;
                response.end("Bad Gateway");
            } else {
                response.end();
            }
        }
    });

    server.listen(PORT, () => {
        console.log(`server starting at port ${PORT}`);
    });

    return server;
}
