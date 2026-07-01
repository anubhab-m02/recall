// MV3 background service worker (spec §13 Phase 5): captures page visits
// and search queries on allowlisted domains (FR-8), buffers everything in
// the durable IndexedDB queue (NFR-REL-2 — this worker can be terminated
// between events, so nothing may live only in memory), and flushes that
// queue against the Local Agent on wake and on a recurring alarm (alarms,
// unlike setInterval, reliably wake a terminated MV3 worker). Also owns
// the "save selection to Recall" context menu (FR-8). This file is pure
// `chrome`-API glue and isn't unit-tested — the logic it calls into
// (domainAllowlist, searchQuery, visitTracker, eventQueue, flushQueue) is.

import type { MemoryEventInput } from "@recall/shared-types";
import { AgentClient } from "./agentClient.js";
import { isDomainAllowed } from "./domainAllowlist.js";
import { enqueueEvent } from "./eventQueue.js";
import { flushQueue } from "./flushQueue.js";
import { getPairingInfo } from "./pairingStore.js";
import { extractSearchQuery } from "./searchQuery.js";
import { getCachedSettings, refreshSettings } from "./settingsStore.js";
import { VisitTracker } from "./visitTracker.js";

const FLUSH_ALARM = "recall-flush-queue";
const SETTINGS_ALARM = "recall-refresh-settings";
const MIN_DWELL_MS = 3000; // ignore accidental/instant navigations
const DEVICE_ID_KEY = "recall.deviceId";
const CONTEXT_MENU_ID = "recall-save-selection";

const visitTracker = new VisitTracker();
let cachedDeviceId: string | undefined;

async function getClient(): Promise<AgentClient | undefined> {
  const pairing = await getPairingInfo();
  return pairing ? new AgentClient(pairing) : undefined;
}

async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const stored = await chrome.storage.local.get(DEVICE_ID_KEY);
  const existing = stored[DEVICE_ID_KEY] as string | undefined;
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }
  const generated = crypto.randomUUID();
  await chrome.storage.local.set({ [DEVICE_ID_KEY]: generated });
  cachedDeviceId = generated;
  return generated;
}

async function captureAndFlush(input: MemoryEventInput): Promise<void> {
  await enqueueEvent(input);
  const client = await getClient();
  if (client) await flushQueue(client);
}

async function handleSearchQuery(url: string): Promise<void> {
  const searchQuery = extractSearchQuery(url);
  if (!searchQuery) return;

  await captureAndFlush({
    tenantId: "local",
    deviceId: await getDeviceId(),
    source: "browser",
    type: "search_query",
    occurredAt: new Date().toISOString(),
    context: { url },
    payload: { engineOrSite: searchQuery.engineOrSite, query: searchQuery.query },
    embeddingText: `search_query | ${searchQuery.engineOrSite} | ${searchQuery.query}`
  });
}

async function endVisitIfTracked(tabId: number): Promise<void> {
  const visit = visitTracker.end(tabId, Date.now());
  if (!visit || visit.dwellMs < MIN_DWELL_MS) return;

  const settings = await getCachedSettings();
  if (settings.capturePaused) return;
  if (!isDomainAllowed(visit.canonicalUrl, settings.domainAllowlist, settings.domainDenylist))
    return;

  await captureAndFlush({
    tenantId: "local",
    deviceId: await getDeviceId(),
    source: "browser",
    type: "page_visit",
    occurredAt: new Date().toISOString(),
    context: { url: visit.canonicalUrl },
    payload: { title: visit.title, canonicalUrl: visit.canonicalUrl, dwellMs: visit.dwellMs },
    embeddingText: `page_visit | ${visit.title} | ${visit.canonicalUrl}`
  });
}

async function handleNavigationComplete(tabId: number, url: string, title: string): Promise<void> {
  await endVisitIfTracked(tabId);
  visitTracker.start(tabId, url, title, Date.now());

  const settings = await getCachedSettings();
  if (settings.capturePaused) return;
  if (!isDomainAllowed(url, settings.domainAllowlist, settings.domainDenylist)) return;
  await handleSearchQuery(url);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;
  void handleNavigationComplete(tabId, tab.url, tab.title ?? tab.url);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void endVisitIfTracked(tabId);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) return;
  const tabUrl = tab.url;
  chrome.tabs.sendMessage(tab.id, { type: "recall.getSelection" }, (response) => {
    const selection = (response as { selection?: string } | undefined)?.selection;
    if (!selection) return;
    void (async () => {
      await captureAndFlush({
        tenantId: "local",
        deviceId: await getDeviceId(),
        source: "browser",
        type: "manual_note",
        occurredAt: new Date().toISOString(),
        context: tabUrl ? { url: tabUrl } : undefined,
        payload: { note: selection, url: tabUrl },
        embeddingText: `manual_note | ${selection.slice(0, 200)}`
      });
    })();
  });
});

function scheduleAlarms(): void {
  chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(SETTINGS_ALARM, { periodInMinutes: 5 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== FLUSH_ALARM && alarm.name !== SETTINGS_ALARM) return;
  void getClient().then((client) => {
    if (!client) return;
    if (alarm.name === FLUSH_ALARM) void flushQueue(client);
    if (alarm.name === SETTINGS_ALARM) void refreshSettings(client);
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Save selection to Recall",
    contexts: ["selection"]
  });
  scheduleAlarms();
  void getClient().then((client) => client && refreshSettings(client));
});

// Alarms already survive a worker restart on their own schedule, but this
// covers the case of the browser itself restarting (onStartup fires once
// per browser launch, onInstalled does not).
chrome.runtime.onStartup.addListener(() => {
  scheduleAlarms();
  void getClient().then((client) => {
    if (!client) return;
    void refreshSettings(client);
    void flushQueue(client);
  });
});
