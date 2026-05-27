import { CONTENT_MESSAGE_TYPES, MOODS, SCAN_DURATION_MS } from "../lib/constants";
import { summarizeEmotionFrames } from "../lib/emotion-engine";
import { getSpotifyTab, sendRuntimeMessage, sendTabMessage } from "../lib/runtime";
import type { BootstrapPayload, EmotionScanResult, MoodKey } from "../lib/types";
import { createFaceScanner, type FaceScanFrame } from "../lib/vision";

const authBadge = document.getElementById("auth-badge") as HTMLSpanElement;
const authCopy = document.getElementById("auth-copy") as HTMLDivElement;
const redirectUri = document.getElementById("redirect-uri") as HTMLDivElement;
const clientIdInput = document.getElementById("client-id-input") as HTMLInputElement;
const saveClientIdButton = document.getElementById("save-client-id") as HTMLButtonElement;
const connectSpotifyButton = document.getElementById("connect-spotify") as HTMLButtonElement;
const disconnectSpotifyButton = document.getElementById("disconnect-spotify") as HTMLButtonElement;
const scannerStateBadge = document.getElementById("scanner-state") as HTMLSpanElement;
const playlistStateBadge = document.getElementById("playlist-state") as HTMLSpanElement;
const gestureStateBadge = document.getElementById("gesture-state") as HTMLSpanElement;
const cameraFeed = document.getElementById("camera-feed") as HTMLVideoElement;
const cameraOverlay = document.getElementById("camera-overlay") as HTMLCanvasElement;
const scanProgress = document.getElementById("scan-progress") as HTMLDivElement;
const scannerCopy = document.getElementById("scanner-copy") as HTMLParagraphElement;
const startScanButton = document.getElementById("start-scan") as HTMLButtonElement;
const stopScanButton = document.getElementById("stop-scan") as HTMLButtonElement;
const moodGrid = document.getElementById("mood-grid") as HTMLDivElement;
const detectedSummary = document.getElementById("detected-summary") as HTMLDivElement;
const resultCard = document.getElementById("playlist-result") as HTMLDivElement;
const openSpotifyButton = document.getElementById("open-spotify") as HTMLButtonElement;
const focusGestureOverlayButton = document.getElementById("focus-gesture-overlay") as HTMLButtonElement;
const openOptionsButton = document.getElementById("open-options") as HTMLButtonElement;

const popupState: {
  bootstrap?: BootstrapPayload;
  scanResult?: EmotionScanResult;
  faceScanner?: Awaited<ReturnType<typeof createFaceScanner>>;
  mediaStream?: MediaStream;
  animationFrame?: number;
  isScanning: boolean;
  scanStartedAt: number;
  frames: FaceScanFrame[];
} = {
  isScanning: false,
  scanStartedAt: 0,
  frames: []
};

function setBadge(element: HTMLElement, label: string, tone: "muted" | "good" | "warn" = "muted") {
  element.textContent = label;
  element.className = `badge ${tone}`;
}

function setBusy(button: HTMLButtonElement, busy: boolean, label: string) {
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

function renderMoodGrid(scanResult?: EmotionScanResult) {
  moodGrid.replaceChildren();

  const moodScores = new Map(scanResult?.moods.map((entry) => [entry.key, entry.score]) ?? []);

  MOODS.forEach((mood) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `mood-card${scanResult?.recommendedMood === mood.key ? " recommended" : ""}`;
    card.addEventListener("click", () => void buildPlaylist(mood.key));

    const heading = document.createElement("h3");
    heading.textContent = mood.label;

    const subtitle = document.createElement("p");
    subtitle.textContent = mood.summary;

    const meter = document.createElement("div");
    meter.className = "mood-meter";
    const fill = document.createElement("span");
    fill.style.width = `${Math.round(((moodScores.get(mood.key) ?? 0.38) * 100))}%`;
    meter.append(fill);

    card.append(heading, subtitle, meter);
    moodGrid.append(card);
  });
}

function renderDetectedSummary(result: EmotionScanResult) {
  detectedSummary.classList.remove("hidden");
  detectedSummary.replaceChildren();

  const title = document.createElement("strong");
  const bestMood = result.moods[0];
  title.textContent = `Detected ${bestMood.label} with ${Math.round(result.confidence * 100)}% confidence`;

  const detail = document.createElement("p");
  detail.textContent = `${bestMood.reasons.join(" • ") || "steady multi-frame facial read"} • ${result.totalFrames} usable frames`;
  detail.style.margin = "8px 0 0";
  detail.style.color = "var(--text-dim)";

  detectedSummary.append(title, detail);
}

function updateAuthUI(bootstrap: BootstrapPayload) {
  redirectUri.textContent = bootstrap.auth.redirectUri;
  clientIdInput.value = bootstrap.settings.spotifyClientId;

  if (bootstrap.auth.isConnected) {
    const product = bootstrap.auth.profile?.product?.toLowerCase();
    const accountLabel = bootstrap.auth.profile?.display_name ?? "Connected";
    setBadge(authBadge, product === "premium" ? "Premium ready" : "Connected", product === "premium" ? "good" : "warn");
    authCopy.textContent =
      product === "premium"
        ? `${accountLabel} is connected. Gesture playback controls are available when Spotify Web Player is active.`
        : `${accountLabel} is connected, but Spotify playback commands require Premium. Playlist building still works.`;
    return;
  }

  setBadge(authBadge, bootstrap.auth.hasClientId ? "Client ID saved" : "Disconnected", bootstrap.auth.hasClientId ? "warn" : "muted");
  authCopy.textContent =
    "Add your Spotify client ID, whitelist the generated redirect URI, then sign in with PKCE.";
}

function drawOverlay(frame?: FaceScanFrame) {
  const context = cameraOverlay.getContext("2d");
  if (!context) {
    return;
  }

  const width = cameraFeed.videoWidth || cameraFeed.clientWidth;
  const height = cameraFeed.videoHeight || cameraFeed.clientHeight;
  cameraOverlay.width = width;
  cameraOverlay.height = height;
  context.clearRect(0, 0, width, height);

  const points = frame?.faceLandmarks?.[0];
  if (!points || points.length === 0) {
    return;
  }

  const xs = points.map((point) => point.x * width);
  const ys = points.map((point) => point.y * height);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  context.strokeStyle = "rgba(129, 241, 211, 0.95)";
  context.lineWidth = 2.5;
  context.strokeRect(minX, minY, maxX - minX, maxY - minY);

  context.fillStyle = "rgba(129, 241, 211, 0.6)";
  for (let index = 0; index < points.length; index += 16) {
    const point = points[index];
    context.beginPath();
    context.arc(point.x * width, point.y * height, 1.8, 0, Math.PI * 2);
    context.fill();
  }
}

async function ensureCamera() {
  if (popupState.mediaStream) {
    return;
  }

  popupState.mediaStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 960 },
      height: { ideal: 720 }
    },
    audio: false
  });

  cameraFeed.srcObject = popupState.mediaStream;
  await cameraFeed.play();
}

async function ensureFaceScanner() {
  if (!popupState.faceScanner) {
    popupState.faceScanner = await createFaceScanner();
  }

  return popupState.faceScanner;
}

function stopCamera() {
  popupState.mediaStream?.getTracks().forEach((track) => track.stop());
  popupState.mediaStream = undefined;
  cameraFeed.srcObject = null;
}

function stopScan(resetState = false, preserveBadge = false) {
  popupState.isScanning = false;
  popupState.scanStartedAt = 0;
  if (popupState.animationFrame) {
    cancelAnimationFrame(popupState.animationFrame);
  }

  popupState.animationFrame = undefined;
  scanProgress.style.width = "0%";

  if (resetState) {
    popupState.frames = [];
  }

  stopCamera();
  setBusy(startScanButton, false, "Scanning");
  if (!preserveBadge) {
    setBadge(scannerStateBadge, "Idle");
  }
}

function finishScan() {
  popupState.isScanning = false;
  const summary = summarizeEmotionFrames(popupState.frames);
  popupState.scanResult = summary;
  renderDetectedSummary(summary);
  renderMoodGrid(summary);
  setBadge(scannerStateBadge, `${summary.moods[0].label} detected`, "good");
  scannerCopy.textContent = `Primary read: ${summary.moods[0].label}. You can trust it, or click a different mood tile if you want to steer the playlist elsewhere.`;
  stopScan(false, true);
}

async function scanLoop(now: number) {
  if (!popupState.isScanning || !popupState.faceScanner) {
    return;
  }

  if (cameraFeed.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    const frame = popupState.faceScanner.detectForVideo(cameraFeed, now);
    popupState.frames.push(frame);
    drawOverlay(frame);
    const elapsed = now - popupState.scanStartedAt;
    scanProgress.style.width = `${Math.min(100, (elapsed / SCAN_DURATION_MS) * 100)}%`;

    if (elapsed >= SCAN_DURATION_MS) {
      finishScan();
      return;
    }
  }

  popupState.animationFrame = requestAnimationFrame((time) => {
    void scanLoop(time);
  });
}

async function startScan() {
  if (popupState.isScanning) {
    return;
  }

  try {
    setBusy(startScanButton, true, "Scanning");
    setBadge(scannerStateBadge, "Starting", "warn");
    scannerCopy.textContent = "Reading your face across multiple frames now. Hold steady for a few seconds.";

    await ensureCamera();
    await ensureFaceScanner();
    popupState.frames = [];
    popupState.isScanning = true;
    popupState.scanStartedAt = performance.now();
    popupState.animationFrame = requestAnimationFrame((time) => {
      void scanLoop(time);
    });
  } catch (error) {
    stopScan(true);
    setBadge(scannerStateBadge, "Camera blocked", "warn");
    scannerCopy.textContent =
      error instanceof Error ? error.message : "Moodify could not access the camera.";
  }
}

async function buildPlaylist(mood: MoodKey) {
  try {
    playlistStateBadge.textContent = "Building";
    playlistStateBadge.className = "badge warn";
    resultCard.className = "result-card";
    resultCard.textContent = "Building a playlist from your long-term listening profile...";

    const result = await sendRuntimeMessage("BUILD_PLAYLIST", { mood });
    setBadge(playlistStateBadge, "Playlist built", "good");

    resultCard.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = result.playlistName;

    const summary = document.createElement("p");
    summary.textContent = `${result.totalTracks} tracks • ${result.familiarTracks} familiar • ${result.discoveryTracks} discovery`;
    summary.style.margin = "8px 0";
    summary.style.color = "var(--text-dim)";

    const taste = document.createElement("p");
    taste.textContent = `Top anchors: ${result.topArtists.join(", ")} • Genres: ${result.topGenres.join(", ")}`;
    taste.style.margin = "0 0 12px";
    taste.style.color = "var(--text-dim)";

    const linkButton = document.createElement("button");
    linkButton.type = "button";
    linkButton.className = "primary-button";
    linkButton.textContent = "Open Playlist on Spotify";
    linkButton.addEventListener("click", async () => {
      await chrome.tabs.create({ url: result.playlistUrl });
    });

    const note = document.createElement("p");
    note.textContent = result.note;
    note.style.margin = "12px 0 0";
    note.style.color = "var(--text-dim)";

    resultCard.append(title, summary, taste, linkButton, note);
  } catch (error) {
    setBadge(playlistStateBadge, "Build failed", "warn");
    resultCard.className = "result-card";
    resultCard.textContent = error instanceof Error ? error.message : "Moodify could not build the playlist.";
  }
}

async function refreshGestureState() {
  const spotifyTab = await getSpotifyTab();

  if (!spotifyTab?.id) {
    setBadge(gestureStateBadge, "Open Spotify first");
    return;
  }

  const status = await sendTabMessage<{ ready: boolean; active: boolean; lastGesture: string }>(spotifyTab.id, {
    type: CONTENT_MESSAGE_TYPES.getGestureHudStatus
  });

  if (!status?.ready) {
    setBadge(gestureStateBadge, "HUD ready");
    return;
  }

  if (status.active) {
    setBadge(gestureStateBadge, `Watching: ${status.lastGesture}`, "good");
    return;
  }

  setBadge(gestureStateBadge, "HUD injected");
}

async function bootstrapPopup() {
  popupState.bootstrap = await sendRuntimeMessage("BOOTSTRAP", undefined);
  updateAuthUI(popupState.bootstrap);
  renderMoodGrid(popupState.scanResult);
  await refreshGestureState();
}

saveClientIdButton.addEventListener("click", async () => {
  setBusy(saveClientIdButton, true, "Saving");
  try {
    popupState.bootstrap = await sendRuntimeMessage("SAVE_SETTINGS", {
      spotifyClientId: clientIdInput.value.trim()
    });
    updateAuthUI(popupState.bootstrap);
  } finally {
    setBusy(saveClientIdButton, false, "Saving");
  }
});

connectSpotifyButton.addEventListener("click", async () => {
  setBusy(connectSpotifyButton, true, "Connecting");
  try {
    popupState.bootstrap = await sendRuntimeMessage("CONNECT_SPOTIFY", undefined);
    updateAuthUI(popupState.bootstrap);
  } catch (error) {
    authCopy.textContent = error instanceof Error ? error.message : "Spotify connection failed.";
  } finally {
    setBusy(connectSpotifyButton, false, "Connecting");
  }
});

disconnectSpotifyButton.addEventListener("click", async () => {
  popupState.bootstrap = await sendRuntimeMessage("DISCONNECT_SPOTIFY", undefined);
  updateAuthUI(popupState.bootstrap);
});

startScanButton.addEventListener("click", () => {
  void startScan();
});

stopScanButton.addEventListener("click", () => {
  stopScan(true);
  setBadge(scannerStateBadge, "Stopped");
});

openSpotifyButton.addEventListener("click", async () => {
  const spotifyTab = await getSpotifyTab();

  if (spotifyTab?.id) {
    await chrome.tabs.update(spotifyTab.id, { active: true });
    return;
  }

  await chrome.tabs.create({ url: "https://open.spotify.com" });
});

focusGestureOverlayButton.addEventListener("click", async () => {
  const spotifyTab = await getSpotifyTab();

  if (!spotifyTab?.id) {
    setBadge(gestureStateBadge, "Open Spotify first", "warn");
    return;
  }

  await chrome.tabs.update(spotifyTab.id, { active: true });
  const status = await sendTabMessage<{ ready: boolean; active: boolean; lastGesture: string }>(spotifyTab.id, {
    type: CONTENT_MESSAGE_TYPES.focusGestureHud
  });

  if (status?.active) {
    setBadge(gestureStateBadge, "Gesture HUD focused", "good");
  }
});

openOptionsButton.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

window.addEventListener("beforeunload", () => {
  stopScan(true);
});

void bootstrapPopup();
