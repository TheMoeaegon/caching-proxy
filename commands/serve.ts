import type { CommandModule } from "yargs";
import { startServer } from "../src/proxy/server";
import { checkOrigin, checkPort, DEFAULT_PORT } from "./shared";

type ServeArgs = {
    port: number;
    origin: string;
};

const DESCRIPTION = "Start the caching proxy server";

export const serveCommand: CommandModule<object, ServeArgs> = {
    command: "serve",
    describe: DESCRIPTION,
    builder: (y) =>
        y
            .usage(`$0 serve -o <origin> [-p <port>]\n\n${DESCRIPTION}`)
            .option("port", {
                alias: "p",
                type: "number",
                default: DEFAULT_PORT,
                describe: "Port to listen on",
            })
            .option("origin", {
                alias: "o",
                type: "string",
                demandOption: true,
                describe: "Upstream origin to proxy and cache",
            })
            .check((args) => {
                checkPort(args.port);
                checkOrigin(args.origin);
                return true;
            }),
    handler: (args) => {
        startServer({
            port: args.port,
            origin: new URL(args.origin).origin,
        });
    },
};
