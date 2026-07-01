// Persists the Local Agent pairing (port + capability token, spec SEC-4a)
// entered once via the popup (see agentClient.ts's header comment for why
// a browser extension needs a manual pairing step rather than reading the
// discovery file directly). chrome.storage.local survives service-worker
// restarts, unlike an in-memory variable — this is glue over the `chrome`
// global and isn't unit-tested, matching this repo's convention of
// keeping platform-API glue thin (see apps/vscode-extension/CLAUDE.md-cited
// pattern: pure logic gets tests, glue stays thin).

import type { PairingInfo } from "./agentClient.js";

const STORAGE_KEY = "recall.pairing";

export async function getPairingInfo(): Promise<PairingInfo | undefined> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return stored[STORAGE_KEY] as PairingInfo | undefined;
}

export async function setPairingInfo(info: PairingInfo): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: info });
}

export async function clearPairingInfo(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}
