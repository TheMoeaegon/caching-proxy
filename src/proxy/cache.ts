import type http from "node:http";
import type { CacheEntry, CacheHit, RevalidationResult } from "../types";
import { clientResponseHeaders } from "./headers";

const DEFAULT_TTL_MS = 60_000;

export const cache = new Map<string, CacheEntry>();

function parseCacheControl(headers: Headers): Map<string, string | true> {
    const directives = new Map<string, string | true>();
    const value = headers.get("cache-control");
    if (!value) return directives;

    for (const part of value.split(",")) {
        const [rawName, ...rest] = part.split("=");
        const name = rawName?.trim().toLowerCase();
        if (!name) continue;

        const rawValue = rest.join("=").trim().replace(/^"|"$/g, "");
        directives.set(name, rawValue === "" ? true : rawValue);
    }

    return directives;
}

function freshnessLifetimeMs(headers: Headers): number {
    const directives = parseCacheControl(headers);

    if (directives.has("no-store") || directives.has("no-cache")) return 0;

    // a proxy is a shared cache, so s-maxage wins over max-age
    const sharedMaxAge = directives.get("s-maxage");
    const maxAge = directives.get("max-age");
    const chosen =
        typeof sharedMaxAge === "string"
            ? sharedMaxAge
            : typeof maxAge === "string"
              ? maxAge
              : undefined;

    if (chosen !== undefined) {
        const seconds = Number(chosen);
        if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    }

    const expires = headers.get("expires");
    if (expires) {
        const expiresAt = Date.parse(expires);
        if (Number.isFinite(expiresAt)) {
            return Math.max(0, expiresAt - Date.now());
        }
    }

    return DEFAULT_TTL_MS;
}

export function isCacheable(status: number, headers: Headers): boolean {
    if (status < 200 || status >= 300) return false;

    const directives = parseCacheControl(headers);
    if (
        directives.has("no-store") ||
        directives.has("no-cache") ||
        directives.has("private")
    ) {
        return false;
    }

    return true;
}

// Age already accumulated before it reached us: max(upstream Age, now - Date).
export function parseInitialAge(headers: Headers): number {
    const parsedAge = Number.parseInt(headers.get("age") ?? "0", 10);
    const upstreamAge =
        Number.isFinite(parsedAge) && parsedAge > 0 ? parsedAge : 0;

    const dateHeader = headers.get("date");
    const dateValue = dateHeader ? Date.parse(dateHeader) : NaN;
    const apparentAge = Number.isFinite(dateValue)
        ? Math.max(0, Math.floor((Date.now() - dateValue) / 1000))
        : 0;

    return Math.max(upstreamAge, apparentAge);
}

export function createEntry(
    body: Uint8Array,
    headers: Headers,
    status: number,
    initialAge: number,
): CacheEntry {
    const now = Date.now();
    const remainingLifetimeMs =
        freshnessLifetimeMs(headers) - initialAge * 1000;

    return {
        body,
        headers: new Headers(headers),
        status,
        storedAt: new Date(now),
        initialAge,
        expiresAt: now + Math.max(0, remainingLifetimeMs),
    };
}

export function store(
    key: string,
    body: Uint8Array,
    headers: Headers,
    status: number,
    initialAge: number,
): CacheEntry {
    const entry = createEntry(body, headers, status, initialAge);
    cache.set(key, entry);
    return entry;
}

export function buildKey(req: http.IncomingMessage) {
    // HEAD is served from the GET entry for the same URL
    const method = req.method === "HEAD" ? "GET" : req.method;
    return `${method} ${req.url}`;
}

export function getCache(key: string): CacheHit | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;

    return { entry, fresh: Date.now() < entry.expiresAt };
}

export function ageSeconds(entry: CacheEntry): number {
    const resident = Math.floor((Date.now() - entry.storedAt.getTime()) / 1000);
    return Math.max(0, entry.initialAge + resident);
}

function refreshEntry(entry: CacheEntry, notModifiedHeaders: Headers): void {
    const initialAge = parseInitialAge(notModifiedHeaders);

    for (const [name, value] of notModifiedHeaders) {
        const lower = name.toLowerCase();
        if (lower === "age") continue;
        if (lower === "content-length") continue;
        if (lower === "content-encoding") continue;
        if (lower === "transfer-encoding") continue;
        if (lower === "set-cookie") continue;
        entry.headers.set(lower, value);
    }

    const now = Date.now();
    entry.storedAt = new Date(now);
    entry.initialAge = initialAge;
    entry.expiresAt =
        now +
        Math.max(0, freshnessLifetimeMs(entry.headers) - initialAge * 1000);
}

export async function revalidate(
    key: string,
    entry: CacheEntry,
    url: URL,
    requestHeaders: Headers,
): Promise<RevalidationResult> {
    const headers = new Headers(requestHeaders);
    headers.delete("if-none-match");
    headers.delete("if-modified-since");

    const etag = entry.headers.get("etag");
    const lastModified = entry.headers.get("last-modified");

    if (etag) {
        headers.set("if-none-match", etag);
    } else if (lastModified) {
        headers.set("if-modified-since", lastModified);
    }

    const res = await fetch(url, { method: "GET", headers });

    if (res.status === 304) {
        refreshEntry(entry, res.headers);
        return { notModified: true, entry };
    }

    const body = new Uint8Array(await res.arrayBuffer());
    const responseHeaders = clientResponseHeaders(res.headers);
    const initialAge = parseInitialAge(res.headers);

    if (isCacheable(res.status, responseHeaders)) {
        const newEntry = store(
            key,
            body,
            responseHeaders,
            res.status,
            initialAge,
        );
        return { notModified: false, entry: newEntry };
    }

    cache.delete(key);
    return {
        notModified: false,
        entry: createEntry(body, responseHeaders, res.status, initialAge),
    };
}
