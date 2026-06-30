import { z } from "zod";

// Local Agent settings (spec §7.5, FR-25/26/28): pause state, capture
// allow/denylists, and the two distinct cloud opt-ins (spec §6.4 — kept as
// separate toggles with separate consent, never conflated).

export const SyncOptInsSchema = z.object({
  encryptedBackup: z.boolean(),
  cloudAssistedSearch: z.boolean()
});
export type SyncOptIns = z.infer<typeof SyncOptInsSchema>;

export const SettingsSchema = z.object({
  capturePaused: z.boolean(),
  projectDenylist: z.array(z.string()),
  domainAllowlist: z.array(z.string()),
  domainDenylist: z.array(z.string()),
  syncOptIns: SyncOptInsSchema
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  capturePaused: false,
  projectDenylist: [],
  domainAllowlist: [],
  domainDenylist: [],
  syncOptIns: {
    encryptedBackup: false,
    cloudAssistedSearch: false
  }
};
