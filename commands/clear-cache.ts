import type { CommandModule } from "yargs";
import { CLEAR_CACHE_PATH } from "../src/proxy/clear-cache";
import { checkPort } from "./shared";

type ClearCacheArgs = {
    port: number;
};

const DESCRIPTION = "Clear the in-memory cache of a running proxy";

/**
 * Asks a running proxy process to drop its in-memory cache. The cache lives in
 * that process, so this CLI process can only reach it over the proxy's own
 * HTTP endpoint.
 */
async function requestCacheClear(port: number): Promise<number> {
    let response: Response;

    try {
        response = await fetch(`http://127.0.0.1:${port}${CLEAR_CACHE_PATH}`, {
            method: "DELETE",
        });
    } catch {
        throw new Error(
            `could not reach a proxy on port ${port}; start one with \`caching-proxy serve --port ${port}\``,
        );
    }

    if (!response.ok) {
        throw new Error(`the proxy on port ${port} returned ${response.status}`);
    }

    const data = (await response.json()) as { cleared?: number };
    return data.cleared ?? 0;
}

export const clearCacheCommand: CommandModule<object, ClearCacheArgs> = {
    command: "clear-cache",
    describe: DESCRIPTION,
    builder: (y) =>
        y
            .usage(`$0 clear-cache -p <port>\n\n${DESCRIPTION}`)
            .option("port", {
                alias: "p",
                type: "number",
                demandOption: true,
                describe: "Port the running proxy listens on",
            })
            .check((args) => {
                checkPort(args.port);
                return true;
            }),
    handler: async (args) => {
        try {
            const cleared = await requestCacheClear(args.port);
            console.log(
                `Cleared ${cleared} ${cleared === 1 ? "entry" : "entries"}.`,
            );
        } catch (error) {
            console.error(`caching-proxy: ${(error as Error).message}`);
            process.exitCode = 1;
        }
    },
};
