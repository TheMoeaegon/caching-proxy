export const DEFAULT_PORT = 3000;

export const NO_ARGS_HELP = `caching-proxy <command> [options]

Commands:
  caching-proxy serve        Start the caching proxy server
  caching-proxy clear-cache  Clear the in-memory cache of a running proxy

Run \`caching-proxy --help\` for global flags, or
\`caching-proxy <command> --help\` for command options.`;

export function checkPort(port: unknown): void {
    if (
        typeof port !== "number" ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535
    ) {
        throw new Error("--port must be an integer between 1 and 65535");
    }
}

export function checkOrigin(origin: string): void {
    let url: URL;
    try {
        url = new URL(origin);
    } catch {
        throw new Error("--origin must be a valid URL");
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("--origin must use http or https");
    }
}
