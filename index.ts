#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { startServer } from "./src/proxy/server";

const argv = yargs(hideBin(process.argv))
    .usage("$0 [options]")
    .option("port", {
        alias: "p",
        type: "number",
        default: 3000,
        describe: "Port for the proxy server",
    })
    .option("origin", {
        alias: "o",
        type: "string",
        default: "https://dummyjson.com",
        describe: "Upstream origin to proxy and cache",
    })
    .check((args) => {
        if (
            typeof args.port !== "number" ||
            !Number.isInteger(args.port) ||
            args.port < 1 ||
            args.port > 65535
        ) {
            throw new Error("--port must be an integer between 1 and 65535");
        }

        let url: URL;
        try {
            url = new URL(args.origin);
        } catch {
            throw new Error("--origin must be a valid URL");
        }

        if (url.protocol !== "http:" && url.protocol !== "https:") {
            throw new Error("--origin must use http or https");
        }

        return true;
    })
    .strict()
    .help()
    .alias("help", "h")
    .version()
    .parseSync();

// normalize to scheme + host so the request path can be appended cleanly
const origin = new URL(argv.origin).origin;

startServer(argv.port, origin);
