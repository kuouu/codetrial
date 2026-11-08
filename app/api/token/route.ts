import { randomInt, randomUUID } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";
import problemData from "@/app/data/problems.json";
import {
  agentDispatchClient,
  INTERVIEW_AGENT_NAME,
  liveKitConfig,
} from "@/app/lib/livekit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const problems = new Set(problemData.map((problem) => problem.page));
const voices = ["Puck", "Charon", "Kore", "Orus"];
const accents = ["American", "British", "Australian", "Canadian", "Indian"];
const MAX_BODY_BYTES = 32_768;
const MAX_REQUESTS_PER_MINUTE = 20;

type RateWindow = { startedAt: number; count: number };
type GlobalWithLimits = typeof globalThis & {
  codeTrialTokenWindows?: Map<string, RateWindow>;
};

const globalWithLimits = globalThis as GlobalWithLimits;
const tokenWindows =
  globalWithLimits.codeTrialTokenWindows ??
  (globalWithLimits.codeTrialTokenWindows = new Map<string, RateWindow>());

function clientAddress(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function rateLimit(address: string) {
  const now = Date.now();
  const window = tokenWindows.get(address);
  if (!window || now - window.startedAt >= 60_000) {
    tokenWindows.set(address, { startedAt: now, count: 1 });
    return true;
  }
  window.count += 1;
  return window.count <= MAX_REQUESTS_PER_MINUTE;
}

function clampDuration(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 45;
  return Math.max(10, Math.min(90, Math.trunc(parsed)));
}

function choose<T extends string>(value: unknown, options: readonly T[]): T {
  if (value === "Random") return options[randomInt(options.length)];
  if (typeof value === "string" && options.includes(value as T)) {
    return value as T;
  }
  return options[0];
}

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return jsonError("Session requests must come from this site.", 403);
  }

  const address = clientAddress(request);
  if (!rateLimit(address)) {
    return jsonError("Too many session requests. Wait a minute and try again.", 429);
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return jsonError("Session request is too large.", 413);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = rawBody ? JSON.parse(rawBody) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonError("Session request must be a JSON object.", 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonError("Session request must be JSON.", 400);
  }

  const config = liveKitConfig();
  if (!config) {
    return jsonError("The server is missing LiveKit credentials.", 503);
  }

  const requestedProblem =
    typeof body.problemId === "string" && problems.has(body.problemId)
      ? body.problemId
      : "chargeback-pair-match";
  const durationMin = clampDuration(body.durationMin);
  const interviewMode = body.interviewMode === "whiteboard" ? "whiteboard" : "coding";
  const interviewLoop =
    body.interviewLoop === "coding_behavioral" ? "coding_behavioral" : "coding";
  const roomName = "codetrial-" + randomUUID().replaceAll("-", "");
  const identity = "candidate-" + randomUUID().slice(0, 12);
  const interviewerVoice = choose(body.interviewerVoice, voices);
  const interviewerAccent = choose(body.interviewerAccent, accents);
  const language =
    typeof body.language === "string" &&
    ["python", "javascript", "c", "cpp", "java"].includes(body.language)
      ? body.language
      : undefined;

  const metadata = {
    problemId: requestedProblem,
    durationMin,
    interviewLoop,
    interviewMode,
    candidateIdentity: identity,
    interviewerVoice,
    interviewerAccent,
    ...(language ? { language } : {}),
    ...(body.hideExamples === true ? { hideExamples: true } : {}),
    ...(body.exampleDrawing === true && interviewMode !== "whiteboard"
      ? { exampleDrawing: true }
      : {}),
    ...(body.candidateLed === true ? { candidateLed: true } : {}),
    ...(body.codeExecution === false ? { codeExecution: false } : {}),
  };

  try {
    const token = new AccessToken(config.apiKey, config.apiSecret, {
      identity,
      name: "Candidate",
      metadata: JSON.stringify(metadata),
      ttl: "2h",
    });
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const jwt = await token.toJwt();

    await agentDispatchClient(config).createDispatch(
      roomName,
      INTERVIEW_AGENT_NAME,
      { metadata: JSON.stringify(metadata) },
    );

    return Response.json(
      {
        token: jwt,
        serverUrl: config.serverUrl,
        roomName,
        guest: true,
        durationMin,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return jsonError(
      "Could not start the interviewer. Please try again in a moment.",
      503,
    );
  }
}
