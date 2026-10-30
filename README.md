# caching-proxy

**Build notes:** [Caching Proxy — Build Notes](https://github.com/TheMoeaegon/engineering-notebook/blob/master/Caching%20Proxy.md)

A small HTTP caching proxy written in TypeScript for Bun. It forwards requests
to an origin, caches `GET`/`HEAD` responses, and revalidates stale entries with
`ETag` / `Last-Modified`.

## Setup

```bash
bun install
```

To expose the CLI globally (`~/.cache/.bun/bin/caching-proxy`):

```bash
bun link
```

## Usage

```bash
caching-proxy                 # show the command list
caching-proxy --help          # show global flags
caching-proxy serve -o https://dummyjson.com
caching-proxy serve -o https://dummyjson.com -p 8080
caching-proxy clear-cache -p 3000  # clear the cache of the proxy on :3000
```

`serve` options:

| Flag | Required | Default | Description |
| --- | --- | --- | --- |
| `-p, --port` | no | `3000` | Port to listen on |
| `-o, --origin` | yes | — | Upstream origin |

`clear-cache` options:

| Flag | Required | Description |
| --- | --- | --- |
| `-p, --port` | yes | Port the running proxy listens on |

## Caching behavior

- Only `GET` and `HEAD` are cached; all other methods are forwarded untouched.
- Freshness comes from `s-maxage`, then `max-age`, then `Expires`.
- `no-store`, `no-cache`, and `private` responses are not cached.
- Only `2xx` responses are stored.
- `Age` is computed from the upstream `Age` / `Date` plus local residency.
- Stale entries are revalidated with `If-None-Match` or `If-Modified-Since`.
- A `304` refreshes the stored metadata; the client gets `304` only when its own
  conditional request matches, otherwise `200` with the cached body.
- Responses include `x-cache: HIT|MISS` and `server: caching-proxy`.

## Clearing the cache

The cache lives in the proxy process's memory, so a separate CLI process cannot
reach it directly. `clear-cache` therefore calls a control endpoint on the
running server:

```bash
DELETE http://127.0.0.1:<port>/__cache
```
