# Cloud deployment

The `codex/cloud-next-livekit` branch introduces a cloud-hosted practice flow.
The lobby and session APIs run as a Next.js app on Vercel. LiveKit Cloud
provides the media rooms and runs the Python interviewer worker. The browser
connects to LiveKit with a short-lived token from the Next.js server.

## Current scope

- The problem browser, device preflight, coding and whiteboard workspaces,
  interview controls, and report viewer are Next.js React pages using shadcn/ui
  primitives and Tailwind.
- The old browser client remains under `/legacy/` only for problem and judge
  data, browser test runners, and vendored assets. Legacy HTML entry points
  redirect to the Next.js pages.
- Accounts and server-side history are disabled. Sessions use anonymous guest
  identities and do not require a profile.
- The Python worker covers the voice interview, editor snapshots, test results,
  and the final report. Several advanced behaviors from the original Rust
  worker (including recording, peer sessions, integrity review, and task mode)
  have not been ported yet.

## Vercel

Use the repository root as the project root, `npm ci` for install, and
`npm run build` for build. The build copies `web/` to `public/legacy/` and
fetches the repository's checksum-pinned browser assets.

Configure these server-only environment variables:

| Variable             | Used by                                  |
| -------------------- | ---------------------------------------- |
| `LIVEKIT_URL`        | Next.js token API and LiveKit server SDK |
| `LIVEKIT_API_KEY`    | Next.js token API and LiveKit server SDK |
| `LIVEKIT_API_SECRET` | Next.js token API and LiveKit server SDK |

Keep all three encrypted and server-side. Do not prefix them with `NEXT_PUBLIC_`.

## LiveKit Cloud worker

The Python project is in `livekit-agent/` and requires Python 3.12. Its LiveKit
agent name must remain `codetrial-interviewer`, matching the dispatch from
`app/api/token/route.ts`.

Set these secrets on the LiveKit deployment:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `GOOGLE_API_KEY`

To run locally, copy `.env.example` to `.env.local`, fill in the credentials,
and run `uv sync` followed by `uv run agent.py dev`. To create or update a Cloud
deployment, use the LiveKit CLI from `livekit-agent/`:

```sh
lk agent create --region us-east --secrets-file ../work/livekit-secrets.env
lk agent deploy --secrets-file ../work/livekit-secrets.env
lk agent status
```

Create a mode-`0600` secrets file outside version control. `work/` is ignored
by Git. Available regions depend on the LiveKit project; check the CLI options
if `us-east` is unavailable.

## Local web development

From the repository root, run `npm ci`, then `npm run dev`. The homepage works
without credentials; starting an interview requires the three LiveKit
variables in `.env.local`. The `/api/session` route is an anonymous session
stub while account functionality is out of scope.

## Next.js browser end-to-end check

After `npm run build`, install Playwright's Chromium once with
`npx playwright install chromium`, then run `npm run test:e2e`. This launches
the built Next.js app and checks the legacy interview redirect, microphone and
camera preflight, LiveKit connection failure fallback, and the in-browser
JavaScript test runner. It uses fake browser media devices and a simulated
LiveKit socket failure; it does not consume LiveKit or model-provider quota.
