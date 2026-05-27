import { CONTENT_MESSAGE_TYPES, GESTURE_COOLDOWN_MS } from "../lib/constants";
import { classifyGesture } from "../lib/gesture-engine";
import { sendRuntimeMessage } from "../lib/runtime";
import { createHandScanner } from "../lib/vision";
import type { GestureLabel } from "../lib/types";

type HandScanner = Awaited<ReturnType<typeof createHandScanner>>;

const hudState: {
  root?: HTMLDivElement;
  statusBadge?: HTMLSpanElement;
  log?: HTMLDivElement;
  video?: HTMLVideoElement;
  canvas?: HTMLCanvasElement;
  startButton?: HTMLButtonElement;
  stopButton?: HTMLButtonElement;
  toggleButton?: HTMLButtonElement;
  scanner?: HandScanner;
  mediaStream?: MediaStream;
  active: boolean;
  animationFrame?: number;
  lastGesture: GestureLabel;
  recentGestures: GestureLabel[];
  lastCommandAt: number;
  palmStartedAt?: number;
  palmResumeTriggered: boolean;
  palmReplayTriggered: boolean;
} = {
  active: false,
  lastGesture: "unknown",
  recentGestures: [],
  lastCommandAt: 0,
  palmResumeTriggered: false,
  palmReplayTriggered: false
};

function setStatus(text: string, tone: "muted" | "good" | "warn" = "muted") {
  if (!hudState.statusBadge) {
    return;
  }

  hudState.statusBadge.textContent = text;
  hudState.statusBadge.className = `moodify-pill ${tone}`;
}

function setLog(text: string) {
  if (hudState.log) {
    hudState.log.textContent = text;
  }
}

function setBusy(button: HTMLButtonElement | undefined, busy: boolean, label: string) {
  if (!button) {
    return;
  }

  button.disabled = busy;
  if (busy) {
    button.dataset.originalLabel = button.textContent ?? "";
    button.textContent = label;
    return;
  }

  if (button.dataset.originalLabel) {
    button.textContent = button.dataset.originalLabel;
  }
}

function attachHud() {
  if (hudState.root) {
    return;
  }

  const root = document.createElement("div");
  root.className = "moodify-shell";

  const shadow = root.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host,
      * {
        box-sizing: border-box;
      }

      .dock {
        position: fixed;
        right: 22px;
        bottom: 22px;
        width: 320px;
        border-radius: 26px;
        padding: 16px;
        color: #f3f4f6;
        background:
          radial-gradient(circle at top left, rgba(129, 241, 211, 0.18), transparent 30%),
          linear-gradient(180deg, rgba(14, 14, 16, 0.96), rgba(7, 7, 8, 0.96));
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 26px 80px rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(18px);
        z-index: 2147483646;
        font-family: "Space Grotesk", "Avenir Next", "Segoe UI", sans-serif;
      }

      .dock.minimized .body {
        display: none;
      }

      .dock.minimized {
        width: 200px;
      }

      .dock.pulse {
        animation: pulse 900ms ease;
      }

      .row,
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .eyebrow {
        margin: 0 0 6px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        font-size: 10px;
        color: #81f1d3;
      }

      .title {
        margin: 0;
        font-size: 20px;
        letter-spacing: -0.03em;
      }

      .copy,
      .tip,
      .log {
        color: #9aa1ab;
        line-height: 1.45;
        font-size: 12px;
      }

      .copy {
        margin: 10px 0 0;
      }

      .moodify-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.04);
        font-size: 11px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .moodify-pill.good {
        background: #81f1d3;
        color: #07110d;
      }

      .moodify-pill.warn {
        background: #ffc36b;
        color: #2b1800;
      }

      .body {
        margin-top: 14px;
      }

      .camera {
        position: relative;
        margin-top: 12px;
        aspect-ratio: 1.05;
        border-radius: 20px;
        overflow: hidden;
        background:
          radial-gradient(circle at center, rgba(129, 241, 211, 0.16), transparent 28%),
          rgba(255, 255, 255, 0.03);
      }

      video,
      canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .tips {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 12px;
      }

      .tip,
      .log {
        padding: 11px 12px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.03);
      }

      .buttons {
        display: flex;
        gap: 10px;
        margin-top: 12px;
      }

      button {
        appearance: none;
        border: none;
        cursor: pointer;
        border-radius: 15px;
        padding: 11px 14px;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        transition: transform 160ms ease, opacity 160ms ease;
      }

      button:hover {
        transform: translateY(-1px);
      }

      button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      .primary {
        background: linear-gradient(135deg, #81f1d3, #4ccfae);
        color: #07110d;
      }

      .ghost {
        background: transparent;
        color: #f3f4f6;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .log {
        margin-top: 12px;
      }

      @keyframes pulse {
        0% {
          transform: scale(1);
        }

        40% {
          transform: scale(1.02);
        }

        100% {
          transform: scale(1);
        }
      }
    </style>
    <section class="dock minimized">
      <div class="header">
        <div>
          <p class="eyebrow">Moodify</p>
          <h2 class="title">Gesture deck</h2>
        </div>
        <button class="ghost" id="toggle">Open</button>
      </div>

      <div class="body">
        <div class="row">
          <p class="copy">Point and open-palm gestures control Spotify playback when the web player is active.</p>
          <span class="moodify-pill" id="status">Idle</span>
        </div>

        <div class="camera">
          <video id="video" playsinline muted></video>
          <canvas id="canvas"></canvas>
        </div>

        <div class="tips">
          <div class="tip">Right: next</div>
          <div class="tip">Left: previous</div>
          <div class="tip">Up: volume up</div>
          <div class="tip">Down: volume down</div>
          <div class="tip">Palm short hold: resume</div>
          <div class="tip">Palm long hold: replay</div>
        </div>

        <div class="buttons">
          <button class="primary" id="start">Enable camera</button>
          <button class="ghost" id="stop">Stop</button>
        </div>

        <div class="log" id="log">Waiting for camera access.</div>
      </div>
    </section>
  `;

  const dock = shadow.querySelector(".dock") as HTMLElement;
  const status = shadow.getElementById("status") as HTMLSpanElement;
  const log = shadow.getElementById("log") as HTMLDivElement;
  const video = shadow.getElementById("video") as HTMLVideoElement;
  const canvas = shadow.getElementById("canvas") as HTMLCanvasElement;
  const startButton = shadow.getElementById("start") as HTMLButtonElement;
  const stopButton = shadow.getElementById("stop") as HTMLButtonElement;
  const toggleButton = shadow.getElementById("toggle") as HTMLButtonElement;

  toggleButton.addEventListener("click", () => {
    dock.classList.toggle("minimized");
    toggleButton.textContent = dock.classList.contains("minimized") ? "Open" : "Hide";
  });

  startButton.addEventListener("click", () => {
    void startGestureControl();
  });

  stopButton.addEventListener("click", () => {
    stopGestureControl();
  });

  document.documentElement.append(root);
  hudState.root = root;
  hudState.statusBadge = status;
  hudState.log = log;
  hudState.video = video;
  hudState.canvas = canvas;
  hudState.startButton = startButton;
  hudState.stopButton = stopButton;
  hudState.toggleButton = toggleButton;
}

function focusHud() {
  const dock = hudState.root?.shadowRoot?.querySelector(".dock") as HTMLElement | null;
  if (!dock || !hudState.toggleButton) {
    return;
  }

  dock.classList.remove("minimized");
  dock.classList.remove("pulse");
  void dock.offsetWidth;
  dock.classList.add("pulse");
  hudState.toggleButton.textContent = "Hide";
}

async function ensureCamera() {
  if (hudState.mediaStream) {
    return;
  }

  hudState.mediaStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 960 },
      height: { ideal: 720 }
    },
    audio: false
  });

  if (!hudState.video) {
    return;
  }

  hudState.video.srcObject = hudState.mediaStream;
  await hudState.video.play();
}

async function ensureScanner() {
  if (!hudState.scanner) {
    hudState.scanner = await createHandScanner();
  }

  return hudState.scanner;
}

function drawLandmarks(landmarks?: Array<{ x: number; y: number }>) {
  const canvas = hudState.canvas;
  const video = hudState.video;
  const context = canvas?.getContext("2d");

  if (!canvas || !video || !context) {
    return;
  }

  const width = video.videoWidth || video.clientWidth;
  const height = video.videoHeight || video.clientHeight;
  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);

  if (!landmarks) {
    return;
  }

  context.fillStyle = "rgba(129, 241, 211, 0.88)";
  landmarks.forEach((point, index) => {
    context.beginPath();
    context.arc(point.x * width, point.y * height, index === 8 ? 4 : 2.2, 0, Math.PI * 2);
    context.fill();
  });
}

function getStableGesture() {
  if (hudState.recentGestures.length < 6) {
    return "unknown" as GestureLabel;
  }

  const candidate = hudState.recentGestures[hudState.recentGestures.length - 1];
  if (candidate === "unknown") {
    return candidate;
  }

  const matches = hudState.recentGestures.filter((gesture) => gesture === candidate).length;
  return matches >= 5 ? candidate : "unknown";
}

async function runPlaybackCommand(command: "next" | "previous" | "volume-up" | "volume-down" | "resume" | "replay") {
  const response = await sendRuntimeMessage("EXECUTE_PLAYBACK", { command });

  if (!response.ok) {
    setStatus("Command blocked", "warn");
    setLog(response.reason ?? "Spotify rejected the command.");
    return;
  }

  setStatus(command.replace("-", " "), "good");
  setLog(`Executed ${command.replace("-", " ")}.`);
}

async function maybeCommitGesture(gesture: GestureLabel, now: number) {
  if (gesture === "unknown") {
    hudState.palmStartedAt = undefined;
    hudState.palmResumeTriggered = false;
    hudState.palmReplayTriggered = false;
    return;
  }

  if (gesture === "open-palm") {
    hudState.palmStartedAt ??= now;
    const heldFor = now - hudState.palmStartedAt;

    if (!hudState.palmResumeTriggered && heldFor > 500) {
      hudState.palmResumeTriggered = true;
      hudState.lastCommandAt = now;
      await runPlaybackCommand("resume");
      return;
    }

    if (!hudState.palmReplayTriggered && heldFor > 1500) {
      hudState.palmReplayTriggered = true;
      hudState.lastCommandAt = now;
      await runPlaybackCommand("replay");
    }

    return;
  }

  hudState.palmStartedAt = undefined;
  hudState.palmResumeTriggered = false;
  hudState.palmReplayTriggered = false;

  if (now - hudState.lastCommandAt < GESTURE_COOLDOWN_MS) {
    return;
  }

  hudState.lastCommandAt = now;

  if (gesture === "point-right") {
    await runPlaybackCommand("next");
    return;
  }

  if (gesture === "point-left") {
    await runPlaybackCommand("previous");
    return;
  }

  if (gesture === "point-up") {
    await runPlaybackCommand("volume-up");
    return;
  }

  if (gesture === "point-down") {
    await runPlaybackCommand("volume-down");
  }
}

async function loop(now: number) {
  if (!hudState.active || !hudState.video || !hudState.scanner) {
    return;
  }

  if (hudState.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    const result = hudState.scanner.detectForVideo(hudState.video, now);
    const landmarks = result.landmarks?.[0];
    drawLandmarks(landmarks);

    const match = classifyGesture(landmarks);
    hudState.lastGesture = match.label;
    hudState.recentGestures.push(match.label);
    hudState.recentGestures = hudState.recentGestures.slice(-8);

    const stableGesture = getStableGesture();

    if (stableGesture !== "unknown") {
      setStatus(stableGesture.replace("-", " "), "good");
      setLog(`Stable gesture: ${stableGesture}.`);
      await maybeCommitGesture(stableGesture, now);
    } else if (match.label !== "unknown") {
      setStatus(`seeing ${match.label.replace("-", " ")}`);
    } else {
      setStatus("Watching");
    }
  }

  hudState.animationFrame = requestAnimationFrame((time) => {
    void loop(time);
  });
}

async function startGestureControl() {
  if (hudState.active) {
    focusHud();
    return;
  }

  try {
    setBusy(hudState.startButton, true, "Starting");
    setStatus("Starting", "warn");
    setLog("Requesting camera and hand tracker...");
    focusHud();

    await ensureCamera();
    await ensureScanner();
    hudState.active = true;
    hudState.recentGestures = [];
    hudState.lastCommandAt = 0;
    hudState.animationFrame = requestAnimationFrame((time) => {
      void loop(time);
    });
    setStatus("Watching", "good");
    setLog("Gesture control is live. Keep your hand inside the camera frame.");
  } catch (error) {
    setStatus("Camera blocked", "warn");
    setLog(error instanceof Error ? error.message : "Moodify could not start the gesture camera.");
  } finally {
    setBusy(hudState.startButton, false, "Starting");
  }
}

function stopGestureControl() {
  hudState.active = false;
  if (hudState.animationFrame) {
    cancelAnimationFrame(hudState.animationFrame);
  }

  hudState.animationFrame = undefined;
  hudState.mediaStream?.getTracks().forEach((track) => track.stop());
  hudState.mediaStream = undefined;
  if (hudState.video) {
    hudState.video.srcObject = null;
  }

  drawLandmarks(undefined);
  setStatus("Idle");
  setLog("Gesture control stopped.");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === CONTENT_MESSAGE_TYPES.getGestureHudStatus) {
    sendResponse({
      ready: true,
      active: hudState.active,
      lastGesture: hudState.lastGesture
    });
    return;
  }

  if (message?.type === CONTENT_MESSAGE_TYPES.focusGestureHud) {
    focusHud();
    sendResponse({
      ready: true,
      active: hudState.active,
      lastGesture: hudState.lastGesture
    });
  }
});

window.addEventListener("beforeunload", () => {
  stopGestureControl();
});

attachHud();
