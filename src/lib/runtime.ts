import type { MessageMap, MessageType, RuntimeMessage } from "./types";

export async function sendRuntimeMessage<K extends MessageType>(
  type: K,
  payload: MessageMap[K]["request"]
): Promise<MessageMap[K]["response"]> {
  const response = (await chrome.runtime.sendMessage({
    type,
    payload
  } satisfies RuntimeMessage<K>)) as MessageMap[K]["response"] & {
    __moodifyError?: string;
  };

  if (
    response &&
    typeof response === "object" &&
    "__moodifyError" in response &&
    typeof response.__moodifyError === "string"
  ) {
    throw new Error(response.__moodifyError);
  }

  return response;
}

export async function sendTabMessage<T>(
  tabId: number,
  message: unknown
): Promise<T | undefined> {
  try {
    return await chrome.tabs.sendMessage(tabId, message) as T;
  } catch (error) {
    if (chrome.runtime.lastError) {
      return undefined;
    }

    throw error;
  }
}

export async function getSpotifyTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({
    url: ["https://open.spotify.com/*"]
  });

  return tabs.find((tab) => tab.id !== undefined);
}
