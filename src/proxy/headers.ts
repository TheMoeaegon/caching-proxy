import type { IncomingMessage } from "node:http";

export const SERVER_NAME = "caching-proxy";

const HOP_BY_HOP = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
]);

const RECOMPUTED_BY_FETCH = new Set(["host", "content-length"]);

const STRIPPED_FROM_UPSTREAM = new Set([
    "content-encoding",
    "transfer-encoding",
    "content-length",
    "age",
]);

function splitConnectionTokens(value: string | null): Set<string> {
    const tokens = new Set<string>();
    if (!value) return tokens;
    for (const token of value.split(",")) {
        const trimmed = token.trim().toLowerCase();
        if (trimmed) tokens.add(trimmed);
    }
    return tokens;
}

export function upstreamRequestHeaders(request: IncomingMessage): Headers {
    const headers = new Headers();

    const connectionTokens = new Set<string>();
    for (let i = 0; i < request.rawHeaders.length; i += 2) {
        const name = request.rawHeaders[i]?.toLowerCase();
        if (name === "connection") {
            for (const token of splitConnectionTokens(
                request.rawHeaders[i + 1] ?? "",
            )) {
                connectionTokens.add(token);
            }
        }
    }

    for (let i = 0; i < request.rawHeaders.length; i += 2) {
        const name = request.rawHeaders[i]?.toLowerCase();
        const value = request.rawHeaders[i + 1];
        if (name === undefined || value === undefined) continue;

        if (HOP_BY_HOP.has(name)) continue;
        if (RECOMPUTED_BY_FETCH.has(name)) continue;
        if (connectionTokens.has(name)) continue;

        headers.append(name, value);
    }

    return headers;
}

export function clientResponseHeaders(upstream: Headers): Headers {
    const headers = new Headers();
    const connectionTokens = splitConnectionTokens(upstream.get("connection"));

    for (const [name, value] of upstream) {
        const lower = name.toLowerCase();

        if (lower === "set-cookie") continue;
        if (HOP_BY_HOP.has(lower)) continue;
        if (STRIPPED_FROM_UPSTREAM.has(lower)) continue;
        if (connectionTokens.has(lower)) continue;

        headers.append(lower, value);
    }

    for (const cookie of upstream.getSetCookie()) {
        headers.append("set-cookie", cookie);
    }

    headers.set("server", SERVER_NAME);

    return headers;
}
