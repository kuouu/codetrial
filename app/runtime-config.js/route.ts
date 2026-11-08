export const dynamic = "force-dynamic";

export async function GET() {
  const body = [
    "globalThis.CODETRIAL_COMPILER_EXPLORER_ENABLED = true;",
    'globalThis.CODETRIAL_COMPILER_EXPLORER_BASE_URL = "https://godbolt.org";',
    "globalThis.CODETRIAL_RECORDING_ENABLED = false;",
    'globalThis.CODETRIAL_CONSENT_VERSION = "";',
    "globalThis.CODETRIAL_REPLAY_VERSION = 1;",
    "globalThis.CODETRIAL_SETUP_ENABLED = false;",
  ].join("\n");

  return new Response(body + "\n", {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/javascript; charset=utf-8",
    },
  });
}
