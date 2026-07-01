// Popup UI (spec §13 Phase 5): capture status, pause/resume, per-domain
// toggle, and the one-time Local Agent pairing form. Plain DOM glue driven
// by index.html — no bundler/JSX needed since this repo already ships
// NodeNext-style `.js`-suffixed relative imports that browsers can load as
// native ES modules (see manifest.json's background service worker for the
// same convention). Kept out of unit tests, same as the VS Code
// extension's `vscode`-importing glue — the logic it calls into
// (popupFormat, domainAllowlist) is unit-tested instead.

import { AgentClient, type PairingInfo } from "../background/agentClient.js";
import { isDomainAllowed } from "../background/domainAllowlist.js";
import { clearPairingInfo, getPairingInfo, setPairingInfo } from "../background/pairingStore.js";
import { refreshSettings } from "../background/settingsStore.js";
import {
  formatCaptureStatus,
  formatDomainToggleButtonLabel,
  formatDomainToggleLabel,
  formatPauseButtonLabel,
  toggleDomainDenylist
} from "./popupFormat.js";

const pairingSection = document.getElementById("pairingSection")!;
const statusSection = document.getElementById("statusSection")!;
const portInput = document.getElementById("portInput") as HTMLInputElement;
const tokenInput = document.getElementById("tokenInput") as HTMLInputElement;
const saveButton = document.getElementById("saveButton")!;
const statusText = document.getElementById("status")!;
const pauseButton = document.getElementById("pauseButton") as HTMLButtonElement;
const domainText = document.getElementById("domainText")!;
const domainButton = document.getElementById("domainButton") as HTMLButtonElement;
const disconnectButton = document.getElementById("disconnectButton")!;

async function getActiveTabHostname(): Promise<string | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return undefined;
  try {
    return new URL(tab.url).hostname;
  } catch {
    return undefined;
  }
}

async function render(): Promise<void> {
  const pairing = await getPairingInfo();
  if (!pairing) {
    pairingSection.classList.remove("hidden");
    statusSection.classList.add("hidden");
    return;
  }

  pairingSection.classList.add("hidden");
  statusSection.classList.remove("hidden");

  const client = new AgentClient(pairing);
  const settings = await refreshSettings(client);
  const hostname = await getActiveTabHostname();
  const allowed = hostname
    ? isDomainAllowed(`https://${hostname}`, settings.domainAllowlist, settings.domainDenylist)
    : false;

  statusText.textContent = formatCaptureStatus(true, settings.capturePaused);
  pauseButton.textContent = formatPauseButtonLabel(settings.capturePaused);
  domainText.textContent = formatDomainToggleLabel(hostname, allowed);
  domainButton.textContent = formatDomainToggleButtonLabel(allowed);
  domainButton.disabled = !hostname;

  pauseButton.onclick = () => {
    void (async () => {
      if (settings.capturePaused) {
        await client.resumeCapture();
      } else {
        await client.pauseCapture();
      }
      await render();
    })();
  };

  domainButton.onclick = () => {
    if (!hostname) return;
    void (async () => {
      const nextDenylist = toggleDomainDenylist(settings.domainDenylist, hostname, allowed);
      await client.updateSettings({ domainDenylist: nextDenylist });
      await render();
    })();
  };
}

saveButton.addEventListener("click", () => {
  void (async () => {
    const port = Number(portInput.value);
    const token = tokenInput.value.trim();
    if (!port || !token) return;
    const pairing: PairingInfo = { port, token };
    if (!(await AgentClient.health(port))) {
      statusText.textContent = "Could not reach an agent on that port.";
      return;
    }
    await setPairingInfo(pairing);
    await render();
  })();
});

disconnectButton.addEventListener("click", () => {
  void (async () => {
    await clearPairingInfo();
    await render();
  })();
});

void render();
