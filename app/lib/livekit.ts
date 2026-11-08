import { AgentDispatchClient } from "livekit-server-sdk";

export const INTERVIEW_AGENT_NAME = "codetrial-interviewer";

export type LiveKitConfig = {
  apiKey: string;
  apiSecret: string;
  serverUrl: string;
  apiHost: string;
};

export function liveKitConfig(): LiveKitConfig | null {
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  const serverUrl = process.env.LIVEKIT_URL?.trim();
  if (!apiKey || !apiSecret || !serverUrl) return null;

  try {
    const parsed = new URL(serverUrl);
    if (parsed.protocol !== "wss:" && parsed.protocol !== "https:") return null;
    parsed.protocol = "https:";
    return {
      apiKey,
      apiSecret,
      serverUrl,
      apiHost: parsed.toString().replace(/\/$/, ""),
    };
  } catch {
    return null;
  }
}

export function agentDispatchClient(config: LiveKitConfig) {
  return new AgentDispatchClient(config.apiHost, config.apiKey, config.apiSecret);
}
