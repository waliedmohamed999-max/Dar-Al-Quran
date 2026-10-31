// The single rule for what religious content may be shown. Every public or student read goes through here.
import { env } from "./env";

export const DEMO_REVIEWER = "demo-seed";

/** Approvals written by the demo seed are labels for development, and never count in production. */
const notDemoReviewed = () => (env.isProd ? { reviewedBy: { not: DEMO_REVIEWER } } : {});

export const approved = () => ({ reviewStatus: "APPROVED" as const, ...notDemoReviewed() });
export const approvedSource = () => ({ status: "APPROVED" as const, ...notDemoReviewed() });

/** Development shows candidate examples with a label. Production shows approved ones only. */
export const visibleExamples = () => (env.isProd ? approved() : { reviewStatus: { not: "REJECTED" as const } });

/** Demo questions and competitions never run in production. */
export const notDemoRow = () => (env.isProd ? { isDemo: false } : {});

/** Tajweed colours are machine-generated, so production needs an explicit decision by the scholarly supervisor. */
export const tajweedColoursEnabled = () => !env.isProd || process.env.TAJWEED_COLOURS_APPROVED === "true";
