import { useEffect, useMemo, useRef } from "react";
import { useAccountDrainProtection } from "../../../hooks/useAccountDrainProtection";
import {
  ACCOUNT_DRAIN_CONTEXT,
  outcomeOf,
  type ProtectionState,
} from "../../../lib/demo-account-drain";
import { voiceClock } from "../../../lib/frab-voice";
import { inr } from "../../../lib/frab-alerts";
import { Dot, Mono } from "../ui";

/**
 * TEMPORARY PROTECTION — Account-Drain popup (SCN07 / CASE0007 only).
 *
 * A dedicated, self-contained experience that replaces the normal investigation
 * path for the mule case. On open it runs the scripted protection sequence and
 * AUTO-FIRES a REAL voice verification call, then branches on the customer's
 * real spoken response:
 *   confirmed  -> account unfrozen, protection released
 *   otherwise  -> case sent for investigation / human review
 *
 * Everything except the voice call is simulated client-side. It never touches
 * the CVM worker or the bank. Voice is real and never faked.
 */

type Stage = "SCANNING" | "DETECTED" | "FROZEN" | "CALLING" | "RESOLVED";

/** Derive the visible stage from the protection state machine. */
function stageOf(state: ProtectionState): Stage {
  switch (state) {
    case "NORMAL":
    case "PROTECTION_TRIGGERED":
      return "SCANNING";
    case "BENEFICIARY_FROZEN":
      return "DETECTED";
    case "VOICE_ESCALATION_INITIATED":
      return "FROZEN";
    case "CALL_IN_PROGRESS":
    case "VOICE_ASSESSMENT_RECEIVED":
      return "CALLING";
    default:
      return "RESOLVED";
  }
}

const STAGE_ORDER: Stage[] = ["SCANNING", "DETECTED", "FROZEN", "CALLING", "RESOLVED"];

function StepRow({
  label,
  detail,
  status,
}: {
  label: string;
  detail?: string;
  status: "done" | "active" | "pending";
}) {
  const tone =
    status === "done"
      ? "text-lime"
      : status === "active"
        ? "text-warning"
        : "text-muted-foreground";
  return (
    <div className="flex items-start gap-3 border-b border-border py-2.5 last:border-b-0">
      <span className="mt-[3px]">
        <Dot state={status === "done" ? "ok" : status === "active" ? "warn" : "idle"} />
      </span>
      <div className="flex-1">
        <Mono className={`block text-[10px] ${tone}`}>{label}</Mono>
        {detail ? (
          <span className="mt-1 block font-mono text-[9px] leading-relaxed tracking-[0.06em] text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </div>
      <Mono className={`text-[8px] ${tone}`}>
        {status === "done" ? "OK" : status === "active" ? "…" : "—"}
      </Mono>
    </div>
  );
}

function Field({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-1.5 last:border-b-0">
      <Mono className="text-[9px] text-muted-foreground">{label}</Mono>
      <Mono className={`text-[9px] ${tone}`}>{value}</Mono>
    </div>
  );
}

export default function AccountDrainProtection({ onClose }: { onClose: () => void }) {
  const protection = useAccountDrainProtection(ACCOUNT_DRAIN_CONTEXT.caseId);
  const fired = useRef(false);

  // Auto-fire the full sequence (detect -> freeze -> REAL voice call) on open.
  useEffect(() => {
    if (fired.current || !protection.active) return;
    fired.current = true;
    protection.trigger();
  }, [protection]);

  // Esc to close.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const stage = stageOf(protection.state);
  const outcome = outcomeOf(protection.state);
  const stageIdx = STAGE_ORDER.indexOf(stage);
  const voice = protection.voice;
  const ctx = ACCOUNT_DRAIN_CONTEXT;

  const stepStatus = (idx: number): "done" | "active" | "pending" =>
    stageIdx > idx ? "done" : stageIdx === idx ? "active" : "pending";

  const callStatus = (voice?.status ?? (protection.voiceStarting ? "CALLING" : "QUEUED")) as string;
  const resolved = stage === "RESOLVED";
  const released = outcome === "RELEASED";
  const review = outcome === "HUMAN_REVIEW";

  const outcomeLabel = released
    ? "ACCOUNT UNFROZEN · PROTECTION RELEASED"
    : review
      ? "CASE SENT FOR INVESTIGATION · HUMAN REVIEW"
      : "PROTECTION ACTIVE";
  const outcomeTone = released ? "text-lime" : review ? "text-critical" : "text-warning";
  const outcomeBorder = released
    ? "border-lime/60"
    : review
      ? "border-critical/60"
      : "border-warning/60";

  const statements = useMemo(() => voice?.customer_statements ?? [], [voice]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-background/85 backdrop-blur-[3px]">
      <div className="frab-grid pointer-events-none absolute inset-0 opacity-[0.08]" />

      <div className="frab-rise relative my-8 w-full max-w-[720px] border border-border bg-surface">
        {/* header */}
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="h-1.5 w-1.5 animate-pulse bg-warning" />
            <Mono className="text-[10px] text-warning">
              TEMPORARY PROTECTION · SUPERVISOR AGENT
            </Mono>
          </div>
          <button
            onClick={onClose}
            className="border border-border px-2 py-1 font-mono text-[9px] tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground"
          >
            [ CLOSE ]
          </button>
        </header>

        {/* case banner */}
        <div className="border-b border-border px-5 py-3">
          <Mono className="text-[9px] text-lime">
            {ctx.caseId} · {ctx.alertId} · PROACTIVE ACCOUNT-DRAIN HARNESS
          </Mono>
          <Mono className="mt-2 block text-[8px] leading-relaxed text-muted-foreground">
            NOT A PERMANENT BANK ACTION. AML / COMPLIANCE ANALYST MAKES THE FINAL DECISION.
          </Mono>
        </div>

        {/* body */}
        <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2">
          {/* left: sequence */}
          <div className="bg-surface px-5 py-4">
            <Mono className="mb-3 block text-[10px] text-foreground">PROTECTION SEQUENCE</Mono>
            <StepRow
              label="SUPERVISOR AGENT WORKING"
              detail="Monitoring outgoing movement for rapid-drain patterns"
              status={stepStatus(0)}
            />
            <StepRow
              label="ACCOUNT DRAIN DETECTED"
              detail={`Rapid outflow from ${ctx.victimAccount} to new beneficiary ${ctx.protectedBeneficiary}`}
              status={stepStatus(1)}
            />
            <StepRow
              label="PROTECTION HARNESS ACTIVATED · BENEFICIARY FROZEN"
              detail={`Beneficiary ${ctx.protectedBeneficiary} temporarily protected pending verification`}
              status={stepStatus(2)}
            />
            <StepRow
              label="VOICE CALLING AGENT INVOKED"
              detail="Placing a real verification call to the customer"
              status={stepStatus(3)}
            />
            <StepRow
              label={
                released
                  ? "PROTECTION RELEASED"
                  : review
                    ? "SENT FOR INVESTIGATION"
                    : "AWAITING OUTCOME"
              }
              detail={
                released
                  ? "Customer verified and authorised — beneficiary unfrozen"
                  : review
                    ? "Verification incomplete or denied — retained for human review"
                    : "Resolving on the customer's verified response"
              }
              status={stepStatus(4)}
            />
          </div>

          {/* right: detected details + live voice */}
          <div className="bg-surface px-5 py-4">
            <Mono className="mb-3 block text-[10px] text-foreground">DETECTED TRANSACTION</Mono>
            <Field label="CUSTOMER" value={ctx.customerName} />
            <Field label="VICTIM ACCOUNT" value={ctx.victimAccount} />
            <Field
              label="PROTECTED BENEFICIARY"
              value={ctx.protectedBeneficiary}
              tone="text-warning"
            />
            <Field label="TRIGGER TXN" value={ctx.triggerTransaction} />
            <Field label="AMOUNT" value={inr(ctx.triggerAmount)} tone="text-critical" />

            <Mono className="mb-2 mt-5 block text-[10px] text-lime">VOICE VERIFICATION</Mono>
            <div className="border border-border px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <Mono className="text-[9px] text-muted-foreground">CALL STATUS</Mono>
                <span className="flex items-center gap-2">
                  <Dot
                    state={
                      callStatus === "COMPLETED"
                        ? "ok"
                        : callStatus === "FAILED" ||
                            callStatus === "UNREACHABLE" ||
                            callStatus === "VOICE_ASSESSMENT_PENDING"
                          ? "bad"
                          : "warn"
                    }
                  />
                  <Mono className="text-[9px] text-foreground">
                    {callStatus.replace(/_/g, " ")}
                  </Mono>
                </span>
              </div>
              {protection.voiceError ? (
                <Mono className="mt-2 block text-[8px] text-critical">
                  {protection.voiceError.toUpperCase()}
                </Mono>
              ) : null}
              {voice?.verification_status ? (
                <div className="mt-2">
                  <Field label="VERIFICATION" value={voice.verification_status} />
                </div>
              ) : null}
              {voice?.call_outcome ? <Field label="OUTCOME" value={voice.call_outcome} /> : null}
              {voice?.summary ? (
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {voice.summary}
                </p>
              ) : (
                <Mono className="mt-2 block text-[8px] text-muted-foreground">
                  {callStatus === "COMPLETED"
                    ? "VOICE ASSESSMENT PENDING STRUCTURED OUTPUT"
                    : "AWAITING CUSTOMER RESPONSE"}
                </Mono>
              )}
              {statements.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {statements.map((s, i) => (
                    <li key={i} className="text-[11px] leading-relaxed text-muted-foreground">
                      · {s}
                    </li>
                  ))}
                </ul>
              ) : null}
              {voice?.recording_reference ? (
                <a
                  href={voice.recording_reference}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block border border-border px-2 py-0.5 font-mono text-[8px] tracking-[0.18em] text-lime transition-colors hover:bg-lime-soft"
                >
                  [ CALL RECORDING ]
                </a>
              ) : null}
              {voice?.transcript ? (
                <details className="mt-2">
                  <summary className="cursor-pointer font-mono text-[8px] tracking-[0.18em] text-muted-foreground hover:text-foreground">
                    TRANSCRIPT
                  </summary>
                  <p className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed text-muted-foreground">
                    {voice.transcript}
                  </p>
                </details>
              ) : null}
            </div>
          </div>
        </div>

        {/* audit strip */}
        {protection.events.length > 0 ? (
          <div className="max-h-[132px] overflow-y-auto border-t border-border px-5 py-3">
            <Mono className="mb-2 block text-[9px] text-muted-foreground">
              PROTECTION AUDIT LOG
            </Mono>
            <ul className="space-y-1.5">
              {protection.events.map((e, i) => (
                <li key={i} className="flex flex-wrap items-center gap-3">
                  <Mono className="text-[8px] text-technical">{voiceClock(e.ts)}</Mono>
                  <Mono className="text-[8px] text-warning">PROTECTION</Mono>
                  <Mono className="text-[8px] text-foreground">{e.event.replace(/_/g, " ")}</Mono>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* outcome + controls */}
        <div className={`border-t-2 ${outcomeBorder} px-5 py-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Mono className={`text-[10px] ${outcomeTone}`}>{outcomeLabel}</Mono>
            <Mono className="text-[8px] text-muted-foreground">
              PROTECTION STATE · {protection.state.replace(/_/g, " ")}
            </Mono>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={protection.keepProtection}
              className="border border-critical/50 px-2.5 py-1 font-mono text-[8px] tracking-[0.18em] text-critical transition-colors hover:bg-critical/10"
            >
              [ KEEP PROTECTION ]
            </button>
            <button
              onClick={protection.releaseProtection}
              className="border border-lime/50 px-2.5 py-1 font-mono text-[8px] tracking-[0.18em] text-lime transition-colors hover:bg-lime-soft"
            >
              [ RELEASE PROTECTION ]
            </button>
            <button
              onClick={protection.continueInvestigation}
              className="border border-border px-2.5 py-1 font-mono text-[8px] tracking-[0.18em] text-technical transition-colors hover:border-lime/60 hover:text-lime"
            >
              [ SEND FOR INVESTIGATION ]
            </button>
            <button
              onClick={onClose}
              className="ml-auto border border-border px-2.5 py-1 font-mono text-[8px] tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
            >
              [ DONE ]
            </button>
          </div>
          {!resolved ? (
            <Mono className="mt-3 block text-[8px] text-muted-foreground">
              SEQUENCE RUNNING · OUTCOME RESOLVES ON THE CUSTOMER&apos;S VERIFIED VOICE RESPONSE
            </Mono>
          ) : null}
        </div>
      </div>
    </div>
  );
}
