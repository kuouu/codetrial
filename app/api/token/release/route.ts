import {
  AgentDispatchClient,
  RoomServiceClient,
  TokenVerifier,
} from "livekit-server-sdk";
import { INTERVIEW_AGENT_NAME, liveKitConfig } from "@/app/lib/livekit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = liveKitConfig();
  if (!config) {
    return Response.json({ released: false }, { status: 503 });
  }

  let body: { roomName?: unknown; token?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Release request must be JSON." }, { status: 400 });
  }

  if (
    typeof body.roomName !== "string" ||
    !/^codetrial-[a-f0-9]{32}$/.test(body.roomName) ||
    typeof body.token !== "string" ||
    body.token.length > 8_192
  ) {
    return Response.json({ error: "Invalid release request." }, { status: 400 });
  }

  try {
    const claims = await new TokenVerifier(config.apiKey, config.apiSecret).verify(
      body.token,
    );
    const identity = claims.sub;
    if (!identity || claims.video?.room !== body.roomName) {
      return Response.json({ error: "Release token does not match the room." }, { status: 403 });
    }

    const rooms = new RoomServiceClient(
      config.apiHost,
      config.apiKey,
      config.apiSecret,
    );
    const participants = await rooms.listParticipants(body.roomName);
    if (participants.some((participant) => participant.identity === identity)) {
      return Response.json({ released: false });
    }

    const dispatches = await new AgentDispatchClient(
      config.apiHost,
      config.apiKey,
      config.apiSecret,
    ).listDispatch(body.roomName);
    const dispatch = dispatches.find(
      (candidate) => candidate.agentName === INTERVIEW_AGENT_NAME,
    );
    if (!dispatch?.id) return Response.json({ released: false });

    await new AgentDispatchClient(
      config.apiHost,
      config.apiKey,
      config.apiSecret,
    ).deleteDispatch(dispatch.id, body.roomName);
    return Response.json({ released: true });
  } catch {
    return Response.json({ released: false }, { status: 503 });
  }
}
