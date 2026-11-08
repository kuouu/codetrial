"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  ArrowLeft,
  AudioLines,
  Camera,
  CameraOff,
  Check,
  Clock3,
  Code2,
  LoaderCircle,
  Mic,
  MicOff,
  Play,
  RotateCcw,
  Send,
  Volume2,
} from "lucide-react";
import {
  ConnectionState,
  ParticipantKind,
  Room,
  RoomEvent,
  Track,
  type Participant,
} from "livekit-client";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Separator } from "@/app/components/ui/separator";
import { Textarea } from "@/app/components/ui/textarea";

type ProblemSummary = {
  page: string;
  title: string;
  source: string;
  difficulty: string;
};

type ProblemDetail = ProblemSummary & {
  brief: string[];
  examples: Array<{ input: string; output: string }>;
  starterCode: Record<string, string>;
};

type Mode = "coding" | "whiteboard";
type Phase = "preflight" | "joining" | "live" | "ending" | "offline" | "report";
type TranscriptLine = { id: number; speaker: "Jim" | "You"; text: string };
type TestCaseResult = {
  label?: string;
  pass?: boolean | null;
  got?: string;
  expected?: string;
  error?: string;
};
type TestSummary = {
  problemId: string;
  language: string;
  code: string;
  passed: number;
  total: number;
  setupError?: string | null;
  runnerUnavailable?: boolean;
  cases: TestCaseResult[];
  [key: string]: unknown;
};
type Feedback = { strengths?: string[]; improvements?: string[] };
type InterviewReport = {
  summary?: string;
  codingScore?: number;
  communicationScore?: number | null;
  decision?: string;
  incomplete?: boolean;
  codingFeedback?: Feedback;
  communicationFeedback?: Feedback;
  improvementPlan?: Array<{
    phase?: string;
    weakness?: string;
    drill?: string;
  }>;
};
type StartReceipt = { roomName: string; token: string };
type InterviewerIdentity = {
  identity: string;
  kind?: ParticipantKind;
  permissions?: { agent?: boolean };
};
type BrowserTestRunner = (
  problemId: string,
  code: string,
  language: string,
  onStatus: (status: string) => void,
  candidateCases: unknown[],
) => Promise<TestSummary>;

const LANGUAGES = [
  { id: "python", name: "Python" },
  { id: "javascript", name: "JavaScript" },
  { id: "java", name: "Java" },
  { id: "cpp", name: "C++" },
  { id: "c", name: "C" },
];
const DURATION_LABEL = (minutes: number) => `${minutes} min`;
const TRANSCRIPT_TOPIC = "lk.transcription";
const CODE_TOPIC = "code_update";
const CONTROL_TOPIC = "control";
const TEST_TOPIC = "test_results";
const BOARD_TOPIC = "board_image";
const REPORT_TOPIC = "report";

function difficultyVariant(value: string) {
  if (value === "Easy") return "easy";
  if (value === "Hard") return "hard";
  return "medium";
}

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function errorText(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.replace(
      /(?:Bearer\s+)[^\s]+/gi,
      "Bearer [redacted]",
    );
    return message ? `${error.name}: ${message}` : error.name;
  }
  return String(error || "Unknown connection error");
}

function isInterviewer(participant?: Participant | InterviewerIdentity) {
  if (!participant) return false;
  return (
    participant.kind === ParticipantKind.AGENT ||
    Boolean(participant.permissions?.agent) ||
    participant.identity.startsWith("interviewer-") ||
    participant.identity.startsWith("agent-")
  );
}

function messageBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value));
}

function reportReceipt(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return crypto.subtle
    .digest("SHA-256", copy.buffer)
    .then((digest) =>
      Array.from(new Uint8Array(digest), (value) =>
        value.toString(16).padStart(2, "0"),
      ).join(""),
    );
}

function ScoreCard({
  label,
  score,
}: {
  label: string;
  score: number | null | undefined;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">
          {typeof score === "number" ? `${score}/100` : "Not scored"}
        </p>
      </CardContent>
    </Card>
  );
}

export default function InterviewExperience({
  problem,
  durationMin,
  mode,
}: {
  problem: ProblemSummary;
  durationMin: number;
  mode: Mode;
}) {
  const [phase, setPhase] = useState<Phase>("preflight");
  const [problemDetail, setProblemDetail] = useState<ProblemDetail | null>(
    null,
  );
  const [problemError, setProblemError] = useState("");
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [mediaMessage, setMediaMessage] = useState("");
  const [deviceMessage, setDeviceMessage] = useState("");
  const [cameraSkipped, setCameraSkipped] = useState(false);
  const [tonePlayed, setTonePlayed] = useState(false);
  const [audioConfirmed, setAudioConfirmed] = useState(false);
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [phaseStatus, setPhaseStatus] = useState(
    "Check your microphone and speaker before joining.",
  );
  const [connectionError, setConnectionError] = useState("");
  const [connectionDetail, setConnectionDetail] = useState("");
  const [agentConnected, setAgentConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [candidateThinking, setCandidateThinking] = useState(false);
  const [language, setLanguage] = useState("python");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [testSummary, setTestSummary] = useState<TestSummary | null>(null);
  const [testStatus, setTestStatus] = useState("");
  const [runningTests, setRunningTests] = useState(false);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(durationMin * 60);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [whiteboardDirty, setWhiteboardDirty] = useState(false);
  const [sendingBoard, setSendingBoard] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioHostRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const roomRef = useRef<Room | null>(null);
  const startReceiptRef = useRef<StartReceipt | null>(null);
  const endRequestedRef = useRef(false);
  const transcriptIdRef = useRef(0);
  const drawingRef = useRef(false);
  mediaStreamRef.current = mediaStream;

  const code = drafts[language] ?? problemDetail?.starterCode?.[language] ?? "";
  const microphoneReady = Boolean(
    mediaStream?.getAudioTracks().some((track) => track.readyState === "live"),
  );
  const cameraReady = Boolean(
    mediaStream?.getVideoTracks().some((track) => track.readyState === "live"),
  );
  const canStart =
    microphoneReady &&
    audioConfirmed &&
    Boolean(problemDetail) &&
    phase === "preflight";
  const connected =
    phase === "live" || phase === "ending" || phase === "report";
  const statusLabel =
    phase === "live"
      ? agentConnected
        ? reconnecting
          ? "Reconnecting"
          : "Live"
        : "Waiting for Jim"
      : phase === "joining"
        ? "Connecting"
        : phase === "ending"
          ? "Preparing report"
          : phase === "report"
            ? "Interview complete"
            : phase === "offline"
              ? "Offline practice"
              : "Setup check";

  useEffect(() => {
    const controller = new AbortController();
    setProblemDetail(null);
    setProblemError("");
    fetch(`/problems/${encodeURIComponent(problem.page)}.json`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Problem details returned ${response.status}.`);
        return response.json() as Promise<ProblemDetail>;
      })
      .then((detail) => setProblemDetail(detail))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setProblemError(errorText(error));
      });
    return () => controller.abort();
  }, [problem.page]);

  useEffect(() => {
    const tracks = mediaStream?.getAudioTracks() ?? [];
    const context = audioContextRef.current;
    if (!context || tracks.length === 0) return;

    const source = context.createMediaStreamSource(new MediaStream(tracks));
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.fftSize);
    let animationFrame = 0;
    let lastRenderedAt = 0;
    const measure = (now: number) => {
      analyser.getByteTimeDomainData(data);
      let total = 0;
      for (const sample of data) total += Math.abs(sample - 128);
      if (now - lastRenderedAt >= 120) {
        setMicrophoneLevel(
          Math.min(100, Math.round((total / data.length) * 2.5)),
        );
        lastRenderedAt = now;
      }
      animationFrame = requestAnimationFrame(measure);
    };
    animationFrame = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(animationFrame);
      source.disconnect();
      analyserRef.current = null;
      setMicrophoneLevel(0);
    };
  }, [cameraOn, mediaStream, phase]);

  useEffect(() => {
    if (!videoRef.current) return;
    const stream = new MediaStream(mediaStream?.getVideoTracks() ?? []);
    videoRef.current.srcObject = stream.getTracks().length ? stream : null;
    if (stream.getTracks().length) void videoRef.current.play().catch(() => {});
    return () => {
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [mediaStream, phase]);

  useEffect(() => {
    if (phase !== "live") return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "live" || mode !== "coding" || !roomRef.current) return;
    const timer = window.setTimeout(() => {
      const currentRoom = roomRef.current;
      if (!currentRoom || currentRoom.state !== ConnectionState.Connected)
        return;
      void currentRoom.localParticipant.publishData(
        messageBytes({ code, language }),
        { reliable: true, topic: CODE_TOPIC },
      );
    }, 450);
    return () => window.clearTimeout(timer);
  }, [code, language, mode, phase]);

  useEffect(
    () => () => {
      const pendingStart = startReceiptRef.current;
      if (pendingStart) {
        void fetch("/api/token/release", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify(pendingStart),
        }).catch(() => {});
      }
      roomRef.current?.disconnect();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        void audioContextRef.current.close();
      }
    },
    [],
  );

  const requestDevices = useCallback(async () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    setMediaMessage("");
    setDeviceMessage("");
    setCameraSkipped(false);
    setAudioConfirmed(false);
    setTonePlayed(false);
    setPhaseStatus("Requesting microphone and camera access…");
    const context = audioContextRef.current ?? new AudioContext();
    audioContextRef.current = context;
    await context.resume().catch(() => {});

    const [audioResult, videoResult] = await Promise.allSettled([
      navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      }),
      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      }),
    ]);
    const audioStream =
      audioResult.status === "fulfilled" ? audioResult.value : null;
    const videoStream =
      videoResult.status === "fulfilled" ? videoResult.value : null;
    const tracks = [
      ...(audioStream?.getAudioTracks() ?? []),
      ...(videoStream?.getVideoTracks() ?? []),
    ];
    const combined = tracks.length ? new MediaStream(tracks) : null;
    setMediaStream(combined);

    if (!audioStream) {
      const reason =
        audioResult.status === "rejected"
          ? errorText(audioResult.reason)
          : "No microphone was returned.";
      setMediaMessage(`Microphone access is required to start. ${reason}`);
      setPhaseStatus("Allow microphone access, then check your setup again.");
      return;
    }
    if (!videoStream) {
      setCameraSkipped(true);
      setDeviceMessage(
        "Camera is unavailable. You can continue with audio only.",
      );
    } else {
      const devices = await navigator.mediaDevices
        .enumerateDevices()
        .catch(() => []);
      const microphoneCount = devices.filter(
        (device) => device.kind === "audioinput",
      ).length;
      setDeviceMessage(
        microphoneCount > 1
          ? `${microphoneCount} microphones are available in your browser.`
          : "Using your default microphone.",
      );
    }
    setPhaseStatus(
      "Microphone is ready. Play the sound and confirm you can hear it.",
    );
  }, []);

  const playTestSound = useCallback(async () => {
    const context = audioContextRef.current ?? new AudioContext();
    audioContextRef.current = context;
    await context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.65);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => setTonePlayed(true);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.68);
  }, []);

  const continueWithoutCamera = useCallback(() => {
    mediaStream?.getVideoTracks().forEach((track) => track.stop());
    setMediaStream((current) =>
      current ? new MediaStream(current.getAudioTracks()) : null,
    );
    setCameraSkipped(true);
    setDeviceMessage("You are continuing without camera video.");
  }, [mediaStream]);

  const publishData = useCallback(async (topic: string, value: unknown) => {
    const currentRoom = roomRef.current;
    if (!currentRoom || currentRoom.state !== ConnectionState.Connected)
      return false;
    await currentRoom.localParticipant.publishData(messageBytes(value), {
      reliable: true,
      topic,
    });
    return true;
  }, []);

  const yieldTurn = useCallback(async () => {
    try {
      await publishData(CONTROL_TOPIC, { type: "yield_turn" });
    } catch (error) {
      setConnectionDetail(errorText(error));
    }
  }, [publishData]);

  const toggleThinking = useCallback(async () => {
    const requested = !candidateThinking;
    setCandidateThinking(requested);
    try {
      const sent = await publishData(CONTROL_TOPIC, {
        type: "thinking",
        thinking: requested,
      });
      if (!sent) setCandidateThinking(false);
    } catch (error) {
      setCandidateThinking(!requested);
      setConnectionDetail(errorText(error));
    }
  }, [candidateThinking, publishData]);

  const handleReport = useCallback(
    async (bytes: Uint8Array) => {
      let incoming: InterviewReport;
      try {
        incoming = JSON.parse(
          new TextDecoder().decode(bytes),
        ) as InterviewReport;
      } catch {
        setConnectionDetail(
          "Jim sent a report that could not be read. You can still return to your problems.",
        );
        return;
      }
      setReport(incoming);
      setPhase("report");
      try {
        const deliveryId = await reportReceipt(bytes);
        await publishData(CONTROL_TOPIC, {
          type: "report_received",
          deliveryId,
        });
      } catch {
        // The report is already visible; receipt failure must not hide it.
      }
    },
    [publishData],
  );

  const startInterview = useCallback(async () => {
    if (!canStart || !problemDetail || !mediaStream) return;
    setPhase("joining");
    setPhaseStatus("Creating your private interview room…");
    setConnectionError("");
    setConnectionDetail("");
    setAgentConnected(false);
    setCandidateThinking(false);
    endRequestedRef.current = false;
    let currentRoom: Room | null = null;

    try {
      const response = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId: problem.page,
          durationMin,
          interviewMode: mode,
          interviewLoop: "coding",
          language,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error =
          typeof body.error === "string"
            ? body.error
            : `Session setup failed (${response.status}).`;
        throw Object.assign(new Error(error), {
          status: response.status,
          code: body.code,
        });
      }
      if (
        typeof body.serverUrl !== "string" ||
        typeof body.token !== "string" ||
        typeof body.roomName !== "string"
      ) {
        throw new Error(
          "The session service returned an incomplete LiveKit connection.",
        );
      }
      startReceiptRef.current = { roomName: body.roomName, token: body.token };
      setPhaseStatus(
        "Connecting to LiveKit. Keep this page open while Jim joins…",
      );

      currentRoom = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = currentRoom;

      currentRoom.on(RoomEvent.ParticipantConnected, (participant) => {
        if (isInterviewer(participant)) {
          setAgentConnected(true);
          setPhaseStatus("Jim is here. You can start talking.");
        }
      });
      currentRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
        if (isInterviewer(participant)) setAgentConnected(false);
      });
      currentRoom.on(RoomEvent.Reconnecting, () => {
        setReconnecting(true);
        setPhaseStatus("Connection interrupted. Trying to reconnect…");
      });
      currentRoom.on(RoomEvent.Reconnected, () => {
        setReconnecting(false);
        setPhaseStatus("Connection restored.");
      });
      currentRoom.on(RoomEvent.Disconnected, () => {
        setReconnecting(false);
        if (!endRequestedRef.current) {
          setPhaseStatus(
            "The room connection ended. Your editor remains available.",
          );
          setPhase("offline");
        }
      });
      currentRoom.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        const audio = track.attach();
        audio.autoplay = true;
        audio.setAttribute("data-interviewer-audio", "true");
        audioHostRef.current?.append(audio);
        void audio.play().catch(() => setAudioBlocked(true));
      });
      currentRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((element) => element.remove());
      });
      currentRoom.on(
        RoomEvent.DataReceived,
        (payload, participant, _kind, topic) => {
          if (!isInterviewer(participant)) return;
          if (topic === REPORT_TOPIC) {
            void handleReport(payload);
            return;
          }
          if (topic === CONTROL_TOPIC) {
            try {
              const message = JSON.parse(new TextDecoder().decode(payload));
              if (
                message.type === "thinking_state" &&
                typeof message.thinking === "boolean"
              ) {
                setCandidateThinking(message.thinking);
              }
            } catch {
              // Ignore control packets that are not valid JSON.
            }
          }
        },
      );
      currentRoom.registerTextStreamHandler(
        TRANSCRIPT_TOPIC,
        async (reader, participant) => {
          if (!isInterviewer(participant)) return;
          const text = (await reader.readAll()).trim();
          if (!text) return;
          transcriptIdRef.current += 1;
          setTranscript((lines) =>
            [
              ...lines,
              { id: transcriptIdRef.current, speaker: "Jim" as const, text },
            ].slice(-100),
          );
        },
      );

      await currentRoom.connect(body.serverUrl, body.token);
      for (const track of mediaStream.getAudioTracks()) {
        await currentRoom.localParticipant.publishTrack(track, {
          source: Track.Source.Microphone,
        });
      }
      for (const track of mediaStream.getVideoTracks()) {
        await currentRoom.localParticipant.publishTrack(track, {
          source: Track.Source.Camera,
        });
      }
      if (
        Array.from(currentRoom.remoteParticipants.values()).some(isInterviewer)
      )
        setAgentConnected(true);
      startReceiptRef.current = null;
      setPhase("live");
      setPhaseStatus("You are connected. Jim will join in a moment.");
      setRemainingSeconds(durationMin * 60);
      setCameraOn(mediaStream.getVideoTracks().length > 0);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? error.code
          : null;
      const status =
        error && typeof error === "object" && "status" in error
          ? error.status
          : null;
      setConnectionError(
        code === "LIVEKIT_DISPATCH_FAILED"
          ? "The interviewer service could not create a live session."
          : code === "LIVEKIT_TOKEN_FAILED"
            ? "The server could not create a LiveKit connection token."
            : status === 503 && /credentials/i.test(errorText(error))
              ? "LiveKit server credentials are missing from this deployment."
              : "The live interview provider could not be reached.",
      );
      setConnectionDetail(errorText(error));
      setPhaseStatus("Your problem workspace is ready for offline practice.");
      setPhase("offline");
      if (currentRoom) {
        await currentRoom.disconnect().catch(() => {});
        if (roomRef.current === currentRoom) roomRef.current = null;
      }
      const receipt = startReceiptRef.current;
      startReceiptRef.current = null;
      if (receipt) {
        await fetch("/api/token/release", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify(receipt),
        }).catch(() => {});
      }
      mediaStream.getTracks().forEach((track) => track.stop());
      setMediaStream(null);
    }
  }, [
    canStart,
    durationMin,
    handleReport,
    language,
    mediaStream,
    mode,
    problem.page,
    problemDetail,
    phase,
  ]);

  const endInterview = useCallback(
    async (reason = "candidate_ended") => {
      if (endRequestedRef.current || phase !== "live") return;
      endRequestedRef.current = true;
      setPhase("ending");
      setPhaseStatus("Jim is preparing your practice report…");
      const payload = {
        type: "end_interview",
        reason,
        code: mode === "coding" ? code : "",
        language,
      };
      try {
        await publishData(CONTROL_TOPIC, payload);
        window.setTimeout(() => {
          setPhase((current) => (current === "ending" ? "offline" : current));
          setConnectionError(
            (current) => current || "The report did not arrive.",
          );
          setPhaseStatus((current) =>
            current.includes("preparing")
              ? "Your interview ended, but no evaluation was saved."
              : current,
          );
        }, 45_000);
      } catch (error) {
        setConnectionDetail(errorText(error));
        setPhase("offline");
      }
    },
    [code, language, mode, phase, publishData],
  );

  useEffect(() => {
    if (phase === "live" && remainingSeconds === 0)
      void endInterview("time_limit");
  }, [endInterview, phase, remainingSeconds]);

  const retrySetup = useCallback(() => {
    setPhase("preflight");
    setConnectionError("");
    setConnectionDetail("");
    setAgentConnected(false);
    setReport(null);
    setTranscript([]);
    setPhaseStatus("Check your microphone and speaker before joining.");
    void requestDevices();
  }, [requestDevices]);

  const toggleMicrophone = useCallback(async () => {
    const tracks = mediaStream?.getAudioTracks() ?? [];
    const nextEnabled = muted;
    tracks.forEach((track) => {
      track.enabled = nextEnabled;
    });
    setMuted(!nextEnabled);
  }, [mediaStream, muted]);

  const toggleCamera = useCallback(async () => {
    const tracks = mediaStream?.getVideoTracks() ?? [];
    const nextEnabled = !cameraOn;
    if (tracks.length)
      tracks.forEach((track) => {
        track.enabled = nextEnabled;
      });
    if (tracks.length === 0 && nextEnabled) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        setMediaStream(
          (current) =>
            new MediaStream([
              ...(current?.getTracks() ?? []),
              ...stream.getVideoTracks(),
            ]),
        );
        setCameraSkipped(false);
      } catch (error) {
        setDeviceMessage(`Camera could not be enabled: ${errorText(error)}`);
        return;
      }
    }
    setCameraOn(nextEnabled);
  }, [cameraOn, mediaStream]);

  const handleRunTests = useCallback(async () => {
    if (!problemDetail || runningTests) return;
    setRunningTests(true);
    setTestStatus("Loading the problem's test cases…");
    const codeSnapshot = code;
    const languageSnapshot = language;
    try {
      const { runBrowserTests } =
        (await import("@/web/runners.js")) as unknown as {
          runBrowserTests: BrowserTestRunner;
        };
      const summary = (await runBrowserTests(
        problem.page,
        codeSnapshot,
        languageSnapshot,
        setTestStatus,
        [],
      )) as TestSummary;
      setTestSummary(summary);
      setTestStatus(
        summary.setupError ||
          `${summary.passed}/${summary.total} tests passed.`,
      );
      if (roomRef.current?.state === ConnectionState.Connected) {
        const failures = summary.cases
          .filter((item) => item.pass !== true)
          .slice(0, 4)
          .map((item) => ({
            label: item.label,
            expected: item.expected,
            got: item.got,
            error: item.error,
          }));
        await publishData(TEST_TOPIC, {
          passed: summary.passed,
          total: summary.total,
          language: languageSnapshot,
          setupError: summary.setupError ?? null,
          diagnostic: summary.diagnostic ?? null,
          runnerUnavailable: Boolean(summary.runnerUnavailable),
          code: codeSnapshot,
          failures,
          candidateCases: [],
        });
      }
    } catch (error) {
      setTestStatus(errorText(error));
    } finally {
      setRunningTests(false);
    }
  }, [code, language, problem.page, problemDetail, publishData, runningTests]);

  const handleCodeChange = useCallback(
    (value: string) => {
      setDrafts((current) => ({ ...current, [language]: value }));
    },
    [language],
  );

  const changeLanguage = useCallback((value: string) => {
    setLanguage(value);
    setTestSummary(null);
    setTestStatus("");
  }, []);

  const sendWhiteboard = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || phase !== "live") return;
    setSendingBoard(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("The whiteboard image could not be created.");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const currentRoom = roomRef.current;
      if (!currentRoom || currentRoom.state !== ConnectionState.Connected)
        return;
      await currentRoom.localParticipant.publishData(bytes, {
        reliable: true,
        topic: BOARD_TOPIC,
      });
      setWhiteboardDirty(false);
    } catch (error) {
      setConnectionDetail(errorText(error));
    } finally {
      setSendingBoard(false);
    }
  }, [phase]);

  const startDrawing = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const bounds = canvas.getBoundingClientRect();
    const scaleX = canvas.width / bounds.width;
    const scaleY = canvas.height / bounds.height;
    const x = (event.clientX - bounds.left) * scaleX;
    const y = (event.clientY - bounds.top) * scaleY;
    context.beginPath();
    context.moveTo(x, y);
    context.strokeStyle = "#172554";
    context.lineWidth = 4 * scaleX;
    context.lineCap = "round";
    context.lineJoin = "round";
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
  }, []);

  const draw = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;
    const bounds = canvas.getBoundingClientRect();
    context.lineTo(
      (event.clientX - bounds.left) * (canvas.width / bounds.width),
      (event.clientY - bounds.top) * (canvas.height / bounds.height),
    );
    context.stroke();
    setWhiteboardDirty(true);
  }, []);

  const stopDrawing = useCallback(() => {
    drawingRef.current = false;
  }, []);

  const clearWhiteboard = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setWhiteboardDirty(true);
  }, []);

  const exampleCards = problemDetail?.examples ?? [];

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            aria-label="Back to CodeTrial"
            className="flex items-center gap-3 text-sm font-semibold"
            href="/"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Code2 aria-hidden="true" className="size-5" />
            </span>
            <span>
              CodeTrial{" "}
              <span className="font-normal text-muted-foreground">
                / Practice
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            {phase === "live" && (
              <span className="hidden items-center gap-2 text-sm tabular-nums text-muted-foreground sm:flex">
                <Clock3 aria-hidden="true" className="size-4" />{" "}
                {formatClock(remainingSeconds)}
              </span>
            )}
            <Badge
              variant={
                phase === "live" && agentConnected
                  ? "default"
                  : phase === "offline"
                    ? "hard"
                    : "secondary"
              }
            >
              <span className="mr-1.5 inline-block size-1.5 rounded-full bg-current" />
              {statusLabel}
            </Badge>
          </div>
        </div>
      </header>

      {phase === "preflight" ? (
        <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:py-12">
          <div className="space-y-6">
            <div>
              <Button asChild className="px-0" variant="link">
                <Link href="/" prefetch={false}>
                  <ArrowLeft aria-hidden="true" className="size-4" /> Back to
                  problems
                </Link>
              </Button>
              <p className="mt-5 text-sm font-medium text-muted-foreground">
                Step 1 of 2 · Setup check
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Check your setup
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Make sure Jim can hear you and you can hear the interviewer
                before you join.
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Microphone and speaker</CardTitle>
                <CardDescription>
                  Your microphone is used for the live conversation. We will not
                  ask for an account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {!mediaStream && (
                  <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                        <Mic aria-hidden="true" className="size-5" />
                      </span>
                      <div>
                        <p className="font-medium">
                          Allow microphone and camera access
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Your browser will ask for permission. Camera is
                          optional.
                        </p>
                      </div>
                    </div>
                    <Button
                      data-testid="enable-media"
                      onClick={() => void requestDevices()}
                    >
                      <Mic aria-hidden="true" className="size-4" /> Enable
                      devices
                    </Button>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 font-medium">
                        <Mic aria-hidden="true" className="size-4" /> Microphone
                      </div>
                      <Badge variant={microphoneReady ? "easy" : "secondary"}>
                        {microphoneReady ? "Ready" : "Needs access"}
                      </Badge>
                    </div>
                    <div
                      aria-label="Microphone input level"
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={microphoneLevel}
                      className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
                      role="meter"
                    >
                      <div
                        className="h-full rounded-full bg-emerald-600 transition-[width] duration-100"
                        style={{ width: `${microphoneLevel}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Speak a few words to check your input level.
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 font-medium">
                        <Volume2 aria-hidden="true" className="size-4" />{" "}
                        Speaker
                      </div>
                      <Badge variant={audioConfirmed ? "easy" : "secondary"}>
                        {audioConfirmed
                          ? "Confirmed"
                          : tonePlayed
                            ? "Confirm sound"
                            : "Not checked"}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        disabled={!microphoneReady}
                        onClick={() => void playTestSound()}
                        size="sm"
                        variant="outline"
                      >
                        <Play aria-hidden="true" className="size-4" /> Play test
                        sound
                      </Button>
                      <Button
                        disabled={!tonePlayed || audioConfirmed}
                        onClick={() => setAudioConfirmed(true)}
                        size="sm"
                        variant={audioConfirmed ? "secondary" : "default"}
                      >
                        <Check aria-hidden="true" className="size-4" /> I can
                        hear it
                      </Button>
                    </div>
                  </div>
                </div>

                {mediaMessage && (
                  <div
                    className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                    role="alert"
                  >
                    {mediaMessage}
                  </div>
                )}
                {deviceMessage && (
                  <p className="text-sm text-muted-foreground" role="status">
                    {deviceMessage}
                  </p>
                )}
                {!mediaStream && !mediaMessage && (
                  <p className="text-sm text-muted-foreground" role="status">
                    {phaseStatus}
                  </p>
                )}

                <Separator />

                <div className="grid gap-5 md:grid-cols-[1fr_18rem] md:items-start">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">Camera</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          A camera helps the interviewer see you. You can
                          continue without it.
                        </p>
                      </div>
                      <Badge
                        variant={
                          cameraReady
                            ? "easy"
                            : cameraSkipped
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {cameraReady
                          ? "Ready"
                          : cameraSkipped
                            ? "Skipped"
                            : "Optional"}
                      </Badge>
                    </div>
                    <Button
                      className="mt-3"
                      disabled={!mediaStream}
                      onClick={continueWithoutCamera}
                      size="sm"
                      variant="outline"
                    >
                      <CameraOff aria-hidden="true" className="size-4" />{" "}
                      Continue without camera
                    </Button>
                  </div>
                  <div className="aspect-video overflow-hidden rounded-lg border bg-muted">
                    {cameraReady && !cameraSkipped ? (
                      <video
                        aria-label="Camera preview"
                        autoPlay
                        className="size-full object-cover"
                        muted
                        playsInline
                        ref={videoRef}
                      />
                    ) : (
                      <div className="flex size-full min-h-28 items-center justify-center text-sm text-muted-foreground">
                        <Camera aria-hidden="true" className="mr-2 size-4" />{" "}
                        Camera preview
                      </div>
                    )}
                  </div>
                </div>

                <Separator />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p
                    aria-live="polite"
                    className="text-sm text-muted-foreground"
                  >
                    {phaseStatus}
                  </p>
                  <Button
                    data-testid="start-interview"
                    disabled={!canStart}
                    onClick={() => void startInterview()}
                    size="lg"
                  >
                    <AudioLines aria-hidden="true" className="size-4" /> Start
                    interview
                  </Button>
                </div>
                {!problemDetail && !problemError && (
                  <p className="text-xs text-muted-foreground">
                    Loading problem details…
                  </p>
                )}
                {problemError && (
                  <p className="text-sm text-destructive" role="alert">
                    Could not load the problem: {problemError}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4 lg:pt-24">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardDescription>Selected problem</CardDescription>
                    <CardTitle className="mt-2 text-xl">
                      {problem.title}
                    </CardTitle>
                  </div>
                  <Badge variant={difficultyVariant(problem.difficulty)}>
                    {problem.difficulty}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {problem.source}
                </p>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Length</span>
                  <span className="font-medium">
                    {DURATION_LABEL(durationMin)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Workspace</span>
                  <span className="font-medium">
                    {mode === "whiteboard" ? "Whiteboard" : "Code editor"}
                  </span>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  Your practice uses a guest session. You can leave whenever you
                  want.
                </p>
              </CardContent>
            </Card>
            {problemDetail && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Problem prompt</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
                  {problemDetail.brief.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </CardContent>
              </Card>
            )}
          </aside>
        </main>
      ) : phase === "report" ? (
        <main className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
          <div>
            <Badge variant={report?.incomplete ? "medium" : "easy"}>
              {report?.incomplete
                ? "Incomplete report"
                : (report?.decision ?? "Practice complete")}
            </Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">
              Your interview report
            </h1>
            <p className="mt-2 text-muted-foreground">
              {problem.title} · {DURATION_LABEL(durationMin)}
            </p>
          </div>
          {report?.summary && (
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="leading-7 text-muted-foreground">
                  {report.summary}
                </p>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <ScoreCard label="Coding" score={report?.codingScore} />
            <ScoreCard
              label="Communication"
              score={report?.communicationScore}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <FeedbackCard
              title="Coding feedback"
              feedback={report?.codingFeedback}
            />
            <FeedbackCard
              title="Communication feedback"
              feedback={report?.communicationFeedback}
            />
          </div>
          {report?.improvementPlan && report.improvementPlan.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Practice plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {report.improvementPlan.map((item, index) => (
                  <div
                    className="rounded-lg border p-4"
                    key={`${item.phase}-${index}`}
                  >
                    <Badge variant="outline">{item.phase ?? "Next step"}</Badge>
                    <p className="mt-3 font-medium">{item.weakness}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.drill}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <Button asChild size="lg">
            <Link href="/">Back to problems</Link>
          </Button>
        </main>
      ) : (
        <main className="mx-auto max-w-[1500px] space-y-5 px-4 py-6 sm:px-6">
          {(phase === "offline" || reconnecting || audioBlocked) && (
            <div
              className="flex flex-col gap-3 rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-start sm:justify-between"
              role="status"
            >
              <div>
                <p className="font-semibold">
                  {phase === "offline"
                    ? connectionError || "You are in offline practice."
                    : reconnecting
                      ? "Trying to restore the live connection…"
                      : "Your browser blocked interviewer audio."}
                </p>
                <p className="mt-1">
                  {phase === "offline"
                    ? "You can still work the problem, but this session will not create a personalized evaluation."
                    : reconnecting
                      ? "Your editor is still available while the connection recovers."
                      : "Enable audio playback to hear Jim."}
                </p>
                {connectionDetail && (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-medium">
                      Connection details
                    </summary>
                    <p className="mt-1 break-words font-mono text-xs">
                      {connectionDetail}
                    </p>
                  </details>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                {audioBlocked && (
                  <Button
                    onClick={() =>
                      void roomRef.current
                        ?.startAudio()
                        .then(() => setAudioBlocked(false))
                        .catch((error) => setConnectionDetail(errorText(error)))
                    }
                    size="sm"
                    variant="outline"
                  >
                    <Volume2 aria-hidden="true" className="size-4" /> Enable
                    audio
                  </Button>
                )}
                {phase === "offline" && (
                  <Button onClick={retrySetup} size="sm" variant="outline">
                    <RotateCcw aria-hidden="true" className="size-4" /> Retry
                    connection
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Button asChild className="mb-3 px-0" variant="link">
                <Link href="/">
                  <ArrowLeft aria-hidden="true" className="size-4" /> Back to
                  problems
                </Link>
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={difficultyVariant(problem.difficulty)}>
                  {problem.difficulty}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {problem.source}
                </span>
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                {problem.title}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {phase === "live" && (
                <Badge variant="secondary">
                  <Clock3 aria-hidden="true" className="mr-1.5 size-3.5" />
                  {formatClock(remainingSeconds)}
                </Badge>
              )}
              {phase === "joining" && (
                <Badge variant="secondary">
                  <LoaderCircle
                    aria-hidden="true"
                    className="mr-1.5 size-3.5 animate-spin"
                  />
                  Connecting
                </Badge>
              )}
              {phase === "ending" && (
                <Badge variant="secondary">
                  <LoaderCircle
                    aria-hidden="true"
                    className="mr-1.5 size-3.5 animate-spin"
                  />
                  Preparing report
                </Badge>
              )}
              {phase === "live" && (
                <Button
                  disabled={!agentConnected}
                  onClick={() => void yieldTurn()}
                  size="sm"
                  variant="outline"
                >
                  <Send aria-hidden="true" className="size-4" /> Done speaking
                </Button>
              )}
              {phase === "live" && (
                <Button
                  aria-pressed={candidateThinking}
                  disabled={!agentConnected}
                  onClick={() => void toggleThinking()}
                  size="sm"
                  variant={candidateThinking ? "default" : "outline"}
                >
                  {candidateThinking ? "Continue" : "Thinking"}
                </Button>
              )}
              {phase === "live" && (
                <Button
                  onClick={() => void toggleMicrophone()}
                  size="sm"
                  variant="outline"
                >
                  {muted ? (
                    <MicOff aria-hidden="true" className="size-4" />
                  ) : (
                    <Mic aria-hidden="true" className="size-4" />
                  )}
                  {muted ? "Unmute" : "Mute"}
                </Button>
              )}
              {phase === "live" && cameraReady && (
                <Button
                  onClick={() => void toggleCamera()}
                  size="sm"
                  variant="outline"
                >
                  <Camera aria-hidden="true" className="size-4" />
                  {cameraOn ? "Camera on" : "Camera off"}
                </Button>
              )}
              {phase === "live" && (
                <Button
                  onClick={() => void endInterview()}
                  size="sm"
                  variant="destructive"
                >
                  End interview
                </Button>
              )}
              {phase === "ending" && (
                <Button disabled size="sm" variant="secondary">
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                  Waiting for report
                </Button>
              )}
            </div>
          </div>

          {phase === "joining" && (
            <Card>
              <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
                {phaseStatus}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-5">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Prompt</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6">
                  {problemDetail?.brief.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {!problemDetail && (
                    <p className="text-muted-foreground">
                      {problemError || "Loading problem details…"}
                    </p>
                  )}
                  {exampleCards.length > 0 && (
                    <div className="grid gap-3 pt-2 md:grid-cols-2">
                      {exampleCards.slice(0, 2).map((example, index) => (
                        <div
                          className="rounded-md border bg-muted/30 p-3"
                          key={`${example.input}-${index}`}
                        >
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Example {index + 1}
                          </p>
                          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">
                            Input: {example.input}
                            {"\n"}Output: {example.output}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {mode === "whiteboard" ? (
                <Card>
                  <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                    <div>
                      <CardTitle>Whiteboard</CardTitle>
                      <CardDescription>
                        Draw an example, a data structure, or your approach.
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={clearWhiteboard}
                        size="sm"
                        variant="outline"
                      >
                        Clear
                      </Button>
                      <Button
                        disabled={
                          !whiteboardDirty || phase !== "live" || sendingBoard
                        }
                        onClick={() => void sendWhiteboard()}
                        size="sm"
                      >
                        {sendingBoard ? (
                          <LoaderCircle
                            aria-hidden="true"
                            className="size-4 animate-spin"
                          />
                        ) : (
                          <Send aria-hidden="true" className="size-4" />
                        )}
                        Share board
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <canvas
                      aria-label="Interview whiteboard"
                      className="aspect-[16/9] w-full touch-none rounded-md border bg-white"
                      height={720}
                      onPointerCancel={stopDrawing}
                      onPointerDown={startDrawing}
                      onPointerMove={draw}
                      onPointerUp={stopDrawing}
                      ref={canvasRef}
                      width={1280}
                    />
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-3">
                    <div>
                      <CardTitle>Code workspace</CardTitle>
                      <CardDescription>
                        Code stays in this browser and syncs with Jim when
                        connected.
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor="language">
                        Programming language
                      </label>
                      <select
                        aria-label="Programming language"
                        className="h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        id="language"
                        onChange={(event) => changeLanguage(event.target.value)}
                        value={language}
                      >
                        {LANGUAGES.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        disabled={
                          !problemDetail ||
                          runningTests ||
                          phase === "joining" ||
                          phase === "ending"
                        }
                        onClick={() => void handleRunTests()}
                        size="sm"
                        variant="outline"
                      >
                        {runningTests ? (
                          <LoaderCircle
                            aria-hidden="true"
                            className="size-4 animate-spin"
                          />
                        ) : (
                          <Play aria-hidden="true" className="size-4" />
                        )}
                        {runningTests ? "Running…" : "Run tests"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      aria-label="Source code"
                      autoCapitalize="off"
                      autoComplete="off"
                      autoCorrect="off"
                      className="min-h-[460px] resize-y bg-muted/25 font-mono text-[13px] leading-6"
                      data-testid="code-editor"
                      onChange={(event) => handleCodeChange(event.target.value)}
                      spellCheck={false}
                      value={code}
                    />
                    {(testStatus || testSummary) && (
                      <div
                        aria-live="polite"
                        className="mt-4 rounded-md border bg-muted/35 p-3 text-sm"
                        role="status"
                      >
                        <p className="font-medium">{testStatus}</p>
                        {testSummary && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Tests run for the saved snapshot in{" "}
                            {LANGUAGES.find(
                              (item) => item.id === testSummary.language,
                            )?.name ?? testSummary.language}
                            .
                          </p>
                        )}
                      </div>
                    )}
                    {testSummary?.cases && testSummary.cases.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {testSummary.cases
                          .slice(0, 6)
                          .map((testCase, index) => (
                            <div
                              className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                              key={`${testCase.label}-${index}`}
                            >
                              <span>
                                {testCase.label ?? `Test ${index + 1}`}
                              </span>
                              <Badge
                                variant={
                                  testCase.pass === true
                                    ? "easy"
                                    : testCase.pass === false
                                      ? "hard"
                                      : "secondary"
                                }
                              >
                                {testCase.pass === true
                                  ? "Passed"
                                  : testCase.pass === false
                                    ? "Failed"
                                    : "Observed"}
                              </Badge>
                            </div>
                          ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            <aside className="space-y-5">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Interviewer</CardTitle>
                    <Badge
                      variant={
                        phase === "live" && agentConnected
                          ? "easy"
                          : phase === "offline"
                            ? "hard"
                            : "secondary"
                      }
                    >
                      {phase === "live" && agentConnected
                        ? "Connected"
                        : phase === "offline"
                          ? "Offline"
                          : phase === "joining"
                            ? "Connecting"
                            : "Waiting"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {cameraReady && cameraOn && (
                    <video
                      aria-label="Your camera preview"
                      autoPlay
                      className="mb-4 aspect-video w-full rounded-lg border object-cover"
                      muted
                      playsInline
                      ref={videoRef}
                    />
                  )}
                  <div className="flex items-center gap-3 rounded-lg bg-primary p-4 text-primary-foreground">
                    <span className="grid size-11 place-items-center rounded-full bg-white/15">
                      <AudioLines aria-hidden="true" className="size-5" />
                    </span>
                    <div>
                      <p className="font-semibold">Jim</p>
                      <p className="text-sm text-white/70">
                        {phase === "live" && agentConnected
                          ? candidateThinking
                            ? "Taking a moment; Jim will wait"
                            : "Listening and ready"
                          : phaseStatus}
                      </p>
                    </div>
                  </div>
                  <div
                    className="mt-4 max-h-[440px] space-y-3 overflow-y-auto"
                    aria-label="Interview transcript"
                    aria-live="polite"
                    role="log"
                  >
                    {transcript.length === 0 ? (
                      <p className="text-sm leading-6 text-muted-foreground">
                        {phase === "live"
                          ? "Jim’s captions will appear here."
                          : "Start the interview to talk with Jim."}
                      </p>
                    ) : (
                      transcript.map((line) => (
                        <div
                          className="rounded-md bg-muted/50 p-3 text-sm leading-6"
                          key={line.id}
                        >
                          <p className="mb-1 text-xs font-semibold text-muted-foreground">
                            {line.speaker}
                          </p>
                          <p>{line.text}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="sr-only" ref={audioHostRef} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Interview tips</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm leading-6 text-muted-foreground">
                    Talk through your thinking as you work. Jim can follow your
                    code and test results when the room is connected.
                  </p>
                  <Separator />
                  <p className="text-sm leading-6 text-muted-foreground">
                    Take time to clarify the prompt, explain an example, and
                    describe what you would test next.
                  </p>
                </CardContent>
              </Card>
              <Button asChild className="w-full" variant="outline">
                <Link href="/">
                  <ArrowLeft aria-hidden="true" className="size-4" /> Return to
                  problem bank
                </Link>
              </Button>
            </aside>
          </div>
        </main>
      )}
    </div>
  );
}

function FeedbackCard({
  title,
  feedback,
}: {
  title: string;
  feedback?: Feedback;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FeedbackList label="What went well" items={feedback?.strengths} />
        <FeedbackList label="What to improve" items={feedback?.improvements} />
      </CardContent>
    </Card>
  );
}

function FeedbackList({ label, items }: { label: string; items?: string[] }) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      {items && items.length > 0 ? (
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm leading-6 text-muted-foreground">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          No feedback available.
        </p>
      )}
    </div>
  );
}
