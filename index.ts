#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { serveCommand } from "./commands/serve";
import { clearCacheCommand } from "./commands/clear-cache";
import { NO_ARGS_HELP } from "./commands/shared";

const rawArgs = hideBin(process.argv);

// Bare `caching-proxy` shows the command list instead of starting a server,
if (rawArgs.length === 0) {
    console.log(NO_ARGS_HELP);
    process.exit(0);
}

await yargs(rawArgs)
    .scriptName("caching-proxy")
    .usage("$0 <command> [options]")
    .command(serveCommand)
    .command(clearCacheCommand)
    .demandCommand(1, "Choose a command: serve or clear-cache")
    .strict()
    .help()
    .alias("help", "h")
    .version()
    .epilogue("Run `caching-proxy <command> --help` for that command's flags.")
    .parse();
