/**
 * TEMPORARY PROTECTION — Account-Drain Harness (SCN07 / MULE_PATTERN only).
 *
 * This is a FRONTEND-SCRIPTED demo harness. It does NOT touch the CVM
 * investigation worker or the bank. The detection, the "beneficiary frozen"
 * protection state, the state machine and its audit events are all simulated
 * client-side, and activate ONLY for the mule case (CASE0007).
 *
 * The ONE real integration is the VOICE VERIFICATION: it uses the live Vapi
 * voice service (see useVoiceEscalation), and the customer's REAL spoken
 * response decides whether protection is released or retained. The voice
 * result is never faked.
 *
 * Everything here is clearly surfaced in the UI as "TEMPORARY PROTECTION —
 * pending human review", never as a permanent bank action. The human analyst
 * remains the final decision-maker.
 *
 * Isolated and easy to remove: gated on ACCOUNT_DRAIN_CASE_ID.
 */

/* ---- activation gate: only the SCN07 mule case ---- */

export const ACCOUNT_DRAIN_CASE_ID = "CASE0007";
export const ACCOUNT_DRAIN_ALERT_ID = "ALT0007";

/** Real values pulled from the bank's investigation bundle for CASE0007. */
export const ACCOUNT_DRAIN_CONTEXT = {
  caseId: ACCOUNT_DRAIN_CASE_ID,
  alertId: ACCOUNT_DRAIN_ALERT_ID,
  customerId: "C009026167",
  customerName: "Vihaan Verma",
  victimAccount: "ACC-C009026167",
  triggerTransaction: "TX009971",
  triggerAmount: 9283.93,
  /** The NEW-relationship mule collection account — the one placed under protection. */
  protectedBeneficiary: "C888000007",
  /**
   * Identity verification factor for the voice call. The service requires an
   * approved Q&A or the assistant hangs up mid-call. This is the factor the
   * customer is asked to confirm before the interview proceeds.
   */
  verificationQuestion: "Which city is your account registered in?",
  verificationAnswer: "Bangalore",
} as const;

/**
 * Demo call target. The voice call is REAL, so it needs a reachable number.
 * Set via VITE_FRAB_VOICE_TEST_PHONE (or the service resolves it). Left here as
 * a single obvious place to configure the demo phone.
 */
export const ACCOUNT_DRAIN_DEMO_PHONE: string | undefined =
  (import.meta.env["VITE_FRAB_VOICE_TEST_PHONE"] as string | undefined) || undefined;

/** True only for the mule case this harness is scoped to. */
export function isAccountDrainCase(caseId: string | undefined): boolean {
  return caseId === ACCOUNT_DRAIN_CASE_ID;
}

/* ---- protection state machine ---- */

export type ProtectionState =
  | "NORMAL"
  | "PROTECTION_TRIGGERED"
  | "BENEFICIARY_FROZEN"
  | "VOICE_ESCALATION_INITIATED"
  | "CALL_IN_PROGRESS"
  | "VOICE_ASSESSMENT_RECEIVED"
  | "CUSTOMER_CONFIRMED"
  | "BENEFICIARY_UNFROZEN"
  | "INVESTIGATION_CONTINUES"
  | "CUSTOMER_DENIED"
  | "VERIFICATION_FAILED"
  | "CUSTOMER_UNREACHABLE"
  | "VOICE_ASSESSMENT_PENDING"
  | "PROTECTION_RETAINED"
  | "HUMAN_REVIEW_REQUIRED";

/** Terminal-outcome grouping for the UI badge. */
export type ProtectionOutcome = "ACTIVE" | "RELEASED" | "HUMAN_REVIEW";

export function outcomeOf(state: ProtectionState): ProtectionOutcome {
  if (state === "BENEFICIARY_UNFROZEN" || state === "INVESTIGATION_CONTINUES") return "RELEASED";
  if (
    state === "PROTECTION_RETAINED" ||
    state === "HUMAN_REVIEW_REQUIRED" ||
    state === "CUSTOMER_DENIED" ||
    state === "VERIFICATION_FAILED" ||
    state === "CUSTOMER_UNREACHABLE"
  ) {
    return "HUMAN_REVIEW";
  }
  return "ACTIVE";
}

/* ---- audit events (real timestamps, scripted content) ---- */

export interface ProtectionEvent {
  event: string;
  ts: string; // ISO
  detail?: string;
}

export function protectionEvent(event: string, detail?: string): ProtectionEvent {
  return { event, ts: new Date().toISOString(), ...(detail ? { detail } : {}) };
}

export const PROTECTION_EVENTS = {
  DETECTED: "ACCOUNT_DRAIN_PATTERN_DETECTED",
  TRIGGERED: "SUPERVISOR_PROTECTION_TRIGGERED",
  APPLIED: "BENEFICIARY_PROTECTION_APPLIED",
  VOICE_REQUESTED: "VOICE_ESCALATION_REQUESTED",
  VOICE_STARTED: "VOICE_CALL_STARTED",
  VOICE_COMPLETED: "VOICE_CALL_COMPLETED",
  CONFIRMED: "CUSTOMER_TRANSACTION_CONFIRMED",
  DENIED: "CUSTOMER_TRANSACTION_DENIED",
  RELEASED: "BENEFICIARY_PROTECTION_RELEASED",
  HUMAN_REVIEW: "HUMAN_REVIEW_REQUIRED",
  RESUMED: "INVESTIGATION_RESUMED",
} as const;

/**
 * Interpret a real structured voice assessment into the protection branch.
 * Mirrors the spec's mapping. The assessment MUST come from the real call.
 */
export function branchFromVoice(assessment: {
  status?: string | undefined;
  verification_status?: string | null | undefined;
  call_outcome?: string | null | undefined;
  customer_requested_human?: boolean | undefined;
}): "CONFIRMED" | "DENIED" | "HUMAN_REVIEW" {
  const status = (assessment.status ?? "").toUpperCase();
  const verify = (assessment.verification_status ?? "").toUpperCase();
  const outcome = (assessment.call_outcome ?? "").toUpperCase();

  // Unreachable / no assessment / pending -> human review, protection retained.
  if (["UNREACHABLE", "FAILED", "VOICE_ASSESSMENT_PENDING", "NONE"].includes(status)) {
    return "HUMAN_REVIEW";
  }
  if (assessment.customer_requested_human) return "HUMAN_REVIEW";
  if (verify !== "VERIFIED") return "HUMAN_REVIEW";

  // Verified + information obtained and authorised -> confirmed (release).
  if (outcome === "INFORMATION_OBTAINED" || outcome === "AUTHORIZED" || outcome === "CONFIRMED") {
    return "CONFIRMED";
  }
  // Verified but not authorised / denied -> denied (retain + review).
  if (outcome === "NOT_AUTHORIZED" || outcome === "DENIED") return "DENIED";

  // Verified but ambiguous outcome -> human review to stay safe.
  return "HUMAN_REVIEW";
}
