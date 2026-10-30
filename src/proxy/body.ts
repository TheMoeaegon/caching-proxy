import type { IncomingMessage } from "node:http";

const BODYLESS_METHODS = new Set(["GET", "HEAD"]);

export async function prepareBody(
    request: IncomingMessage,
): Promise<Uint8Array | undefined> {
    const method = request.method ?? "GET";
    if (BODYLESS_METHODS.has(method)) return undefined;

    const chunks: Buffer[] = [];
    for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    if (chunks.length === 0) return undefined;

    return Buffer.concat(chunks);
}
