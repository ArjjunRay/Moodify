import { sendRuntimeMessage } from "../lib/runtime";
import type { BootstrapPayload } from "../lib/types";

const clientIdInput = document.getElementById("client-id-input") as HTMLInputElement;
const redirectUri = document.getElementById("redirect-uri") as HTMLDivElement;
const playlistVisibility = document.getElementById("playlist-visibility") as HTMLSelectElement;
const playlistSize = document.getElementById("playlist-size") as HTMLInputElement;
const volumeStep = document.getElementById("volume-step") as HTMLInputElement;
const saveSettingsButton = document.getElementById("save-settings") as HTMLButtonElement;
const connectSpotifyButton = document.getElementById("connect-spotify") as HTMLButtonElement;
const disconnectSpotifyButton = document.getElementById("disconnect-spotify") as HTMLButtonElement;
const settingsStatus = document.getElementById("settings-status") as HTMLDivElement;

function setStatus(text: string) {
  settingsStatus.textContent = text;
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

function fillSettings(bootstrap: BootstrapPayload) {
  clientIdInput.value = bootstrap.settings.spotifyClientId;
  redirectUri.textContent = bootstrap.auth.redirectUri;
  playlistVisibility.value = bootstrap.settings.playlistVisibility;
  playlistSize.value = String(bootstrap.settings.playlistSize);
  volumeStep.value = String(bootstrap.settings.volumeStep);

  if (bootstrap.auth.isConnected) {
    const name = bootstrap.auth.profile?.display_name ?? "Spotify account";
    const product = bootstrap.auth.profile?.product?.toLowerCase();
    setStatus(
      product === "premium"
        ? `${name} is connected with Premium. Gesture playback controls can work on open.spotify.com.`
        : `${name} is connected, but playback controls need Premium. Playlist generation still works.`
    );
    return;
  }

  setStatus("Waiting for setup.");
}

saveSettingsButton.addEventListener("click", async () => {
  setBusy(saveSettingsButton, true, "Saving");
  try {
    const bootstrap = await sendRuntimeMessage("SAVE_SETTINGS", {
      spotifyClientId: clientIdInput.value.trim(),
      playlistVisibility: playlistVisibility.value as "private" | "public",
      playlistSize: Math.max(20, Math.min(50, Number(playlistSize.value) || 32)),
      volumeStep: Math.max(2, Math.min(20, Number(volumeStep.value) || 8))
    });
    fillSettings(bootstrap);
    setStatus("Settings saved.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to save settings.");
  } finally {
    setBusy(saveSettingsButton, false, "Saving");
  }
});

connectSpotifyButton.addEventListener("click", async () => {
  setBusy(connectSpotifyButton, true, "Connecting");
  try {
    const bootstrap = await sendRuntimeMessage("CONNECT_SPOTIFY", undefined);
    fillSettings(bootstrap);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Spotify connection failed.");
  } finally {
    setBusy(connectSpotifyButton, false, "Connecting");
  }
});

disconnectSpotifyButton.addEventListener("click", async () => {
  const bootstrap = await sendRuntimeMessage("DISCONNECT_SPOTIFY", undefined);
  fillSettings(bootstrap);
  setStatus("Spotify disconnected.");
});

void sendRuntimeMessage("BOOTSTRAP", undefined).then(fillSettings).catch((error) => {
  setStatus(error instanceof Error ? error.message : "Failed to load settings.");
});
