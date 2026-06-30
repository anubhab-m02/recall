// Re-exports the rule-based secret detectors from @recall/redaction-rules
// (spec §5.2, SEC-3). Kept as a thin seam so agent-specific extensions
// (e.g. user-defined custom patterns from settings) can be layered in here
// later without touching the shared, side-effect-free detection package.

export { findSecrets, redactText } from "@recall/redaction-rules";
export type { Finding } from "@recall/redaction-rules";
