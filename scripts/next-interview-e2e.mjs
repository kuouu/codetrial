import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url);
const baseUrl = (process.env.CODETRIAL_E2E_BASE_URL || "").replace(/\/$/, "");
const baseDirectory = new URL(root).pathname;
let server;
let serverOutput = "";

async function availablePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function startServer() {
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { cwd: baseDirectory, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  for (const stream of [server.stdout, server.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      serverOutput = (serverOutput + chunk).slice(-6000);
    });
  }

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before it was ready:\n${serverOutput}`);
    }
    try {
      const response = await fetch(origin);
      if (response.ok) return origin;
    } catch {
      // The server is still starting.
    }
    await delay(250);
  }
  throw new Error(
    `Next.js did not become ready within 30 seconds:\n${serverOutput}`,
  );
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([once(server, "exit"), delay(5_000)]);
  if (server.exitCode === null) server.kill("SIGKILL");
}

function fakeToken() {
  const encode = (value) => Buffer.from(value).toString("base64url");
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const claims = encode(
    JSON.stringify({
      iss: "e2e",
      sub: "candidate",
      video: { roomJoin: true, room: "codetrial-e2e" },
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  return `${header}.${claims}.e2e-signature`;
}

async function run() {
  const origin = baseUrl || (await startServer());
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  try {
    const context = await browser.newContext({
      permissions: ["camera", "microphone"],
    });
    const page = await context.newPage();
    const pageErrors = [];
    const releaseRequests = [];
    let tokenRequest;
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.route("**/api/token", async (route) => {
      tokenRequest = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          serverUrl: "wss://codetrial.invalid",
          roomName: "codetrial-e2e",
          token: fakeToken(),
        }),
      });
    });
    await page.route("**/api/token/release", async (route) => {
      releaseRequests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"ok":true}',
      });
    });
    await page.routeWebSocket("wss://codetrial.invalid/**", (socket) => {
      setTimeout(
        () =>
          socket.close({
            code: 1011,
            reason: "Simulated LiveKit connection failure",
          }),
        800,
      );
    });

    const oldInterview = await context.request.get(
      `${origin}/interview.html?problem=chargeback-pair-match&duration=45`,
      { maxRedirects: 0 },
    );
    assert.equal(
      oldInterview.status(),
      307,
      "legacy interview URL redirects to Next.js",
    );
    assert.equal(
      oldInterview.headers().location,
      "/interview?problem=chargeback-pair-match&duration=45",
    );

    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: /Start interview/ }).click();
    await page.getByRole("heading", { name: "Check your setup" }).waitFor();
    await page.getByRole("button", { name: /Enable devices/ }).click();
    await page
      .getByText(
        "Microphone is ready. Play the sound and confirm you can hear it.",
      )
      .waitFor();
    await page.getByLabel("Camera preview").waitFor();

    await page.getByRole("button", { name: "Play test sound" }).click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (button) =>
          button.textContent.includes("I can hear it") && !button.disabled,
      ),
    );
    await page.getByRole("button", { name: "I can hear it" }).click();
    await page.getByRole("button", { name: "Start interview" }).click();
    const workspaceCamera = page.getByLabel("Your camera preview");
    await workspaceCamera.waitFor();
    assert.equal(
      await workspaceCamera.evaluate((video) =>
        video.srcObject
          ?.getVideoTracks()
          .some((track) => track.readyState === "live"),
      ),
      true,
      "the camera preview reattaches when preflight becomes the workspace",
    );

    await page
      .getByText("The live interview provider could not be reached.")
      .waitFor();
    await page.getByRole("textbox", { name: "Source code" }).waitFor();
    await page
      .getByText(
        "You can still work the problem, but this session will not create a personalized evaluation.",
      )
      .waitFor();
    await page.getByText("Connection details").click();
    await page.getByText(/Simulated LiveKit connection failure/).waitFor();
    assert.deepEqual(tokenRequest, {
      problemId: "chargeback-pair-match",
      durationMin: 45,
      interviewMode: "coding",
      interviewLoop: "coding",
      language: "python",
    });
    assert.equal(
      releaseRequests.length,
      1,
      "the failed room dispatch is released",
    );

    const javascriptSolution = [
      "function matchDisputedCharge(nums, target) {",
      "  const seen = new Map();",
      "  for (let i = 0; i < nums.length; i++) {",
      "    const other = target - nums[i];",
      "    if (seen.has(other)) return [seen.get(other), i];",
      "    seen.set(nums[i], i);",
      "  }",
      "  return [];",
      "}",
    ].join("\n");
    await page.getByLabel("Programming language").selectOption("javascript");
    await page
      .getByRole("textbox", { name: "Source code" })
      .fill(javascriptSolution);
    await page.getByRole("button", { name: "Run tests" }).click();
    await page.getByText("5/5 tests passed.").waitFor({ timeout: 30_000 });
    assert.deepEqual(
      pageErrors,
      [],
      "the interview flow has no uncaught browser errors",
    );
    await context.close();

    console.log(
      "PASS: legacy redirect, camera/microphone preflight, failed LiveKit fallback, and JavaScript problem tests (5/5).",
    );
  } finally {
    await browser.close();
  }
}

try {
  await run();
} finally {
  await stopServer();
}
