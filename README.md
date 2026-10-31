# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

To export the running rig's 2026-10-28 digest as one self-contained HTML file, choose an
existing output directory outside this repository and run:

```sh
node scripts/export-digest.mjs /tmp/2026-10-28-digest.html
```

The command fetches `http://127.0.0.1:8787/digest/2026-10-28`, checks the response and page,
and writes the served HTML unchanged, including the lane banner. An alternate local server URL
can be supplied as the second argument.
