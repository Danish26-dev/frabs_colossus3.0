import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceEscalation } from "./useVoiceEscalation";
import {
  ACCOUNT_DRAIN_CONTEXT,
  PROTECTION_EVENTS,
  branchFromVoice,
  isAccountDrainCase,
  outcomeOf,
  protectionEvent,
  type ProtectionEvent,
  type ProtectionOutcome,
  type ProtectionState,
} from "../lib/demo-account-drain";

export interface ProtectionRun {
  /** True only for the SCN07 / CASE0007 mule case. */
  active: boolean;
  state: ProtectionState;
  outcome: ProtectionOutcome;
  events: ProtectionEvent[];
  context: typeof ACCOUNT_DRAIN_CONTEXT;
  voiceStarting: boolean;
  voiceError: string | null;
  /** Live voice assessment (real Vapi call), null until the call resolves. */
  voice: ReturnType<typeof useVoiceEscalation>["state"];
  /** Kick off: freeze beneficiary → start the real voice verification. */
  trigger: () => void;
  /** Human controls. */
  keepProtection: () => void;
  releaseProtection: () => void;
  continueInvestigation: () => void;
}

/**
 * Frontend-scripted TEMPORARY PROTECTION harness for the mule case, wrapping a
 * REAL voice verification. Everything except the voice call is simulated in the
 * browser; the confirm/deny branch is driven by the real structured assessment.
 */
export function useAccountDrainProtection(caseId: string | undefined): ProtectionRun {
  const active = isAccountDrainCase(caseId);
  const voice = useVoiceEscalation(ACCOUNT_DRAIN_CONTEXT.caseId);

  const [state, setState] = useState<ProtectionState>("NORMAL");
  const [events, setEvents] = useState<ProtectionEvent[]>([]);
  const branched = useRef(false);

  const push = useCallback((event: string, detail?: string) => {
    setEvents((prev) => [...prev, protectionEvent(event, detail)]);
  }, []);

  // Trigger: scripted detection → freeze → start the REAL voice call.
  const trigger = useCallback(() => {
    if (!active) return;
    branched.current = false;
    setState("PROTECTION_TRIGGERED");
    push(
      PROTECTION_EVENTS.DETECTED,
      `Rapid outgoing movement from ${ACCOUNT_DRAIN_CONTEXT.victimAccount} to new beneficiary ${ACCOUNT_DRAIN_CONTEXT.protectedBeneficiary}`,
    );
    push(PROTECTION_EVENTS.TRIGGERED, "Supervisor initiated temporary protection");
    setState("BENEFICIARY_FROZEN");
    push(
      PROTECTION_EVENTS.APPLIED,
      `Beneficiary ${ACCOUNT_DRAIN_CONTEXT.protectedBeneficiary} temporarily protected pending verification`,
    );
    // Real voice verification.
    setState("VOICE_ESCALATION_INITIATED");
    push(PROTECTION_EVENTS.VOICE_REQUESTED, "Customer verification via FRAB Voice Investigator");
    voice.start({
      alert_id: ACCOUNT_DRAIN_CONTEXT.alertId,
      frab_recommendation: "ESCALATE",
      risk_tier: "HIGH",
      verification_question: ACCOUNT_DRAIN_CONTEXT.verificationQuestion,
      verification_expected_answer: ACCOUNT_DRAIN_CONTEXT.verificationAnswer,
    });
    setState("CALL_IN_PROGRESS");
    push(PROTECTION_EVENTS.VOICE_STARTED, "Outbound verification call placed");
  }, [active, push, voice]);

  // React to the REAL voice assessment once it resolves.
  const voiceState = voice.state;
  useEffect(() => {
    if (!active || branched.current || !voiceState) return;
    const status = (voiceState.status ?? "").toUpperCase();
    const settled = ["COMPLETED", "FAILED", "UNREACHABLE", "VOICE_ASSESSMENT_PENDING"].includes(
      status,
    );
    if (!settled) return;

    branched.current = true;
    setState("VOICE_ASSESSMENT_RECEIVED");
    push(PROTECTION_EVENTS.VOICE_COMPLETED, voiceState.summary ?? "Voice assessment received");

    const branch = branchFromVoice({
      status: voiceState.status,
      verification_status: voiceState.verification_status,
      call_outcome: voiceState.call_outcome,
      customer_requested_human: voiceState.customer_requested_human,
    });

    if (branch === "CONFIRMED") {
      setState("CUSTOMER_CONFIRMED");
      push(PROTECTION_EVENTS.CONFIRMED, "Customer confirmed and authorised the transaction");
      setState("BENEFICIARY_UNFROZEN");
      push(PROTECTION_EVENTS.RELEASED, "Temporary protection released after verification");
      setState("INVESTIGATION_CONTINUES");
      push(PROTECTION_EVENTS.RESUMED, "Investigation resumed");
    } else if (branch === "DENIED") {
      setState("CUSTOMER_DENIED");
      push(PROTECTION_EVENTS.DENIED, "Customer denied authorising the transaction");
      setState("PROTECTION_RETAINED");
      push(
        PROTECTION_EVENTS.HUMAN_REVIEW,
        "Protection retained — AML / compliance review required",
      );
      setState("HUMAN_REVIEW_REQUIRED");
    } else {
      // Unreachable / unverified / pending -> retain + human review.
      setState("PROTECTION_RETAINED");
      push(
        PROTECTION_EVENTS.HUMAN_REVIEW,
        "Verification incomplete — protection retained, AML / compliance review required",
      );
      setState("HUMAN_REVIEW_REQUIRED");
    }
  }, [active, voiceState, push]);

  // Human controls.
  const keepProtection = useCallback(() => {
    setState("HUMAN_REVIEW_REQUIRED");
    push(PROTECTION_EVENTS.HUMAN_REVIEW, "Analyst kept protection active");
  }, [push]);

  const releaseProtection = useCallback(() => {
    setState("BENEFICIARY_UNFROZEN");
    push(PROTECTION_EVENTS.RELEASED, "Analyst released protection");
  }, [push]);

  const continueInvestigation = useCallback(() => {
    setState("INVESTIGATION_CONTINUES");
    push(PROTECTION_EVENTS.RESUMED, "Analyst resumed investigation");
  }, [push]);

  return {
    active,
    state,
    outcome: outcomeOf(state),
    events,
    context: ACCOUNT_DRAIN_CONTEXT,
    voiceStarting: voice.starting,
    voiceError: voice.error,
    voice: voice.state,
    trigger,
    keepProtection,
    releaseProtection,
    continueInvestigation,
  };
}
