// Caches the Local Agent's settings (pause state, domain allow/denylist)
// in chrome.storage.local so serviceWorker.ts can make a fast, synchronous-
// ish capture/skip decision on every tab navigation without a network
// round trip per page load. Fails closed: until settings are fetched at
// least once, capture is treated as paused rather than assuming
// DEFAULT_SETTINGS' unpaused default — an unreachable/unpaired agent must
// never result in silent capture.

import { DEFAULT_SETTINGS, type Settings } from "@recall/shared-types";
import type { AgentClient } from "./agentClient.js";

const STORAGE_KEY = "recall.settingsCache";
const UNKNOWN_SETTINGS: Settings = { ...DEFAULT_SETTINGS, capturePaused: true };

export async function getCachedSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as Settings | undefined) ?? UNKNOWN_SETTINGS;
}

export async function refreshSettings(client: AgentClient): Promise<Settings> {
  try {
    const settings = await client.getSettings();
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
    return settings;
  } catch {
    return getCachedSettings();
  }
}
