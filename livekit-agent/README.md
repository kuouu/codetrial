# CodeTrial LiveKit agent

This Python worker joins a room through LiveKit Cloud and runs the interviewer
conversation with Gemini Live. The Next.js token route explicitly dispatches
the codetrial-interviewer agent by name.

## Local development

Use Python 3.12 and uv. Copy .env.example to .env.local, fill it from the
LiveKit and Google AI Studio projects, then run:

    uv sync
    uv run agent.py dev

Never commit .env.local. The production deployment receives credentials via
LiveKit Cloud secrets.

## Deploy

From this directory, create the LiveKit Cloud agent in an available region:

    lk agent create --region us-east --secrets-file ../work/livekit-secrets.env

For later versions, deploy from this directory with:

    lk agent deploy --secrets-file ../work/livekit-secrets.env

The worker name is `codetrial-interviewer`, matching the dispatch name in the
Next.js API. `livekit.toml` identifies the created LiveKit agent; it contains no
API credentials.

The Vercel application needs `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and
`LIVEKIT_API_SECRET` in its server environment. Browser bundles only receive
the short-lived room token minted by the server.
