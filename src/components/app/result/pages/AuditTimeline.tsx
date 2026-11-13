import type {
  AnalystDecisionRecord,
  CallingAgentState,
  InvestigationResult,
} from "../../../../lib/frab-result";
import { voiceClock, type VoiceState, type VoiceStatus } from "../../../../lib/frab-voice";
import {
  outcomeOf,
  type ProtectionEvent,
  type ProtectionState,
} from "../../../../lib/demo-account-drain";
import { Mono } from "../../ui";

const NA = "NOT AVAILABLE";

/** Injected only for the SCN07 mule case — the TEMPORARY PROTECTION harness. */
export interface ProtectionView {
  active: boolean;
  state: ProtectionState;
  events: ProtectionEvent[];
  context: {
    victimAccount: string;
    protectedBeneficiary: string;
    customerName: string;
    triggerAmount: number;
  };
  starting: boolean;
  onKeep: () => void;
  onRelease: () => void;
  onContinue: () => void;
}

function statusTone(status: VoiceStatus): string {
  if (status === "COMPLETED") return "text-lime";
  if (status === "CALLING" || status === "IN_PROGRESS" || status === "QUEUED")
    return "text-warning";
  return "text-critical"; // FAILED | UNREACHABLE | VOICE_ASSESSMENT_PENDING
}

function isActive(status: VoiceStatus): boolean {
  return status === "QUEUED" || status === "CALLING" || status === "IN_PROGRESS";
}

/** Investigation timeline + voice escalation, rendered from recorded events only. */
export default function AuditTimeline({
  result,
  decision,
  call,
  voice,
  voiceStarting,
  voiceError,
  voiceAvailable,
  protection,
  onRequestCall,
}: {
  result: InvestigationResult;
  decision: AnalystDecisionRecord | null;
  call: CallingAgentState | null;
  /** Live voice state from the voice service (null until escalated / not live). */
  voice?: VoiceState | null;
  voiceStarting?: boolean;
  voiceError?: string | null;
  voiceAvailable?: boolean;
  protection?: ProtectionView | null;
  onRequestCall: () => void;
}) {
  const events = result.timeline;
  // Fold real voice timeline events into the audit trail when present.
  const voiceEvents = voice?.timeline ?? [];

  return (
    <div className="grid grid-cols-1 gap-px border border-border bg-border lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="relative bg-background px-5 py-6">
        <div className="frab-grid pointer-events-none absolute inset-0 opacity-[0.10]" />
        <div className="relative">
          <Mono className="block text-[10px] text-lime">INVESTIGATION TIMELINE</Mono>
          {events.length === 0 ? (
            <Mono className="mt-6 block text-[9px] text-warning">AUDIT EVENTS {NA}</Mono>
          ) : (
            <ol className="mt-5 border-l border-border">
              {events.map((t, i) => (
                <li key={`${t.ts}-${i}`} className="relative py-3 pl-6">
                  <span className="absolute left-[-3.5px] top-[18px] h-1.5 w-1.5 bg-lime" />
                  <span className="flex flex-wrap items-center gap-3">
                    <Mono className="text-[9px] text-technical">{t.ts}</Mono>
                    <Mono className="text-[9px] text-lime">{t.agent}</Mono>
                    <Mono className="text-[9px] text-foreground">
                      {t.action.replace(/_/g, " ")}
                    </Mono>
                  </span>
                  <p className="mt-1 text-[12px] leading-relaxed text-secondary-foreground">
                    {t.result}
                    {t.evidenceIds.length ? ` · ${t.evidenceIds.join(" · ")}` : ""}
                  </p>
                </li>
              ))}
              <li className="relative py-3 pl-6">
                <span
                  className={`absolute left-[-3.5px] top-[18px] h-1.5 w-1.5 ${decision ? "bg-lime" : "bg-border"}`}
                />
                <Mono className="text-[9px] text-muted-foreground">
                  ANALYST DECISION ·{" "}
                  {decision ? `${decision.action.replace(/_/g, " ")} · ${decision.ts}` : "PENDING"}
                </Mono>
              </li>

              {/* Real voice events, when the escalation has produced any. */}
              {voiceEvents.length > 0 ? (
                voiceEvents.map((v, i) => (
                  <li key={`voice-${i}`} className="relative py-3 pl-6">
                    <span className="absolute left-[-3.5px] top-[18px] h-1.5 w-1.5 bg-lime" />
                    <span className="flex flex-wrap items-center gap-3">
                      <Mono className="text-[9px] text-technical">{voiceClock(v.timestamp)}</Mono>
                      <Mono className="text-[9px] text-lime">VOICE</Mono>
                      <Mono className="text-[9px] text-foreground">
                        {v.event.replace(/_/g, " ")}
                      </Mono>
                    </span>
                  </li>
                ))
              ) : (
                <li className="relative py-3 pl-6">
                  <span
                    className={`absolute left-[-3.5px] top-[18px] h-1.5 w-1.5 ${
                      voice || (call && call.state !== "NOT_CONNECTED") ? "bg-lime" : "bg-border"
                    }`}
                  />
                  <Mono className="text-[9px] text-muted-foreground">
                    VOICE ESCALATION ·{" "}
                    {voice
                      ? voice.status.replace(/_/g, " ")
                      : call
                        ? call.state.replace(/_/g, " ")
                        : NA}
                  </Mono>
                </li>
              )}

              {/* Temporary-protection events (SCN07 harness), when present. */}
              {protection?.events.map((p, i) => (
                <li key={`prot-${i}`} className="relative py-3 pl-6">
                  <span className="absolute left-[-3.5px] top-[18px] h-1.5 w-1.5 bg-warning" />
                  <span className="flex flex-wrap items-center gap-3">
                    <Mono className="text-[9px] text-technical">{voiceClock(p.ts)}</Mono>
                    <Mono className="text-[9px] text-warning">PROTECTION</Mono>
                    <Mono className="text-[9px] text-foreground">{p.event.replace(/_/g, " ")}</Mono>
                  </span>
                  {p.detail ? (
                    <p className="mt-1 text-[12px] leading-relaxed text-secondary-foreground">
                      {p.detail}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="bg-surface px-5 py-6">
        {protection?.active ? <ProtectionPanel protection={protection} voice={voice} /> : null}

        <Mono className="block text-[10px] text-lime">VOICE ESCALATION</Mono>
        <Mono className="mt-1 block text-[8px] text-muted-foreground">FRAB VOICE INVESTIGATOR</Mono>

        {/* When the voice service isn't configured, keep the existing note. */}
        {!voiceAvailable && !voice ? (
          <>
            <p className="mt-3 text-[12px] leading-relaxed text-secondary-foreground">
              Calls are never placed automatically. The analyst confirms every escalation call.
            </p>
          </>
        ) : null}

        <button
          onClick={onRequestCall}
          disabled={Boolean(voiceStarting) || (voice ? isActive(voice.status) : false)}
          className="mt-4 border border-border px-3 py-1.5 font-mono text-[9px] tracking-[0.2em] text-foreground transition-colors hover:border-lime/60 hover:text-lime disabled:opacity-40"
        >
          {voiceStarting
            ? "[ STARTING… ]"
            : voice && isActive(voice.status)
              ? "[ CALL IN PROGRESS ]"
              : "[ CALL ESCALATION AGENT ]"}
        </button>

        {voiceError ? (
          <Mono className="mt-3 block border border-critical/60 px-2 py-1 text-[9px] text-critical">
            {voiceError.toUpperCase()}
          </Mono>
        ) : null}

        {/* Status + contact strip */}
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4">
          <div>
            <Mono className="block text-[8px] text-muted-foreground">CALL STATUS</Mono>
            <Mono
              className={`mt-1 block text-[10px] ${
                voice
                  ? statusTone(voice.status)
                  : call && call.state !== "NOT_CONNECTED"
                    ? "text-lime"
                    : "text-warning"
              }`}
            >
              {voice ? voice.status.replace(/_/g, " ") : call ? call.state.replace(/_/g, " ") : NA}
            </Mono>
          </div>
          <div>
            <Mono className="block text-[8px] text-muted-foreground">VERIFICATION</Mono>
            <Mono
              className={`mt-1 block text-[10px] ${
                voice?.verification_status === "VERIFIED" ? "text-lime" : "text-warning"
              }`}
            >
              {voice?.verification_status ? voice.verification_status.replace(/_/g, " ") : NA}
            </Mono>
          </div>
        </div>

        {/* Full assessment — only rendered when the call completed with data. */}
        {voice && voice.status === "COMPLETED" ? (
          <div className="mt-5 space-y-4 border-t border-border pt-4">
            <div>
              <Mono className="block text-[8px] text-muted-foreground">OUTCOME</Mono>
              <Mono className="mt-1 block text-[10px] text-foreground">
                {(voice.call_outcome ?? "—").replace(/_/g, " ")}
              </Mono>
            </div>

            {voice.summary ? (
              <div>
                <Mono className="block text-[8px] text-muted-foreground">SUMMARY</Mono>
                <p className="mt-1 text-[12px] leading-relaxed text-secondary-foreground">
                  {voice.summary}
                </p>
              </div>
            ) : null}

            {voice.customer_statements && voice.customer_statements.length > 0 ? (
              <div>
                <Mono className="block text-[8px] text-muted-foreground">CUSTOMER STATEMENTS</Mono>
                <ul className="mt-1 space-y-1">
                  {voice.customer_statements.map((s, i) => (
                    <li key={i} className="text-[12px] leading-relaxed text-secondary-foreground">
                      · {s}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {voice.unresolved_questions && voice.unresolved_questions.length > 0 ? (
              <div>
                <Mono className="block text-[8px] text-muted-foreground">UNRESOLVED QUESTIONS</Mono>
                <ul className="mt-1 space-y-1">
                  {voice.unresolved_questions.map((s, i) => (
                    <li key={i} className="text-[12px] leading-relaxed text-warning">
                      · {s}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {voice.analyst_attention && voice.analyst_attention.length > 0 ? (
              <div>
                <Mono className="block text-[8px] text-muted-foreground">ANALYST ATTENTION</Mono>
                <ul className="mt-1 space-y-1">
                  {voice.analyst_attention.map((s, i) => (
                    <li key={i} className="text-[12px] leading-relaxed text-critical">
                      · {s}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {voice.customer_requested_human ? (
              <Mono className="block border-l-2 border-warning bg-warning/10 px-2 py-1 text-[9px] text-warning">
                CUSTOMER REQUESTED A HUMAN
              </Mono>
            ) : null}

            {voice.recommended_actions && voice.recommended_actions.length > 0 ? (
              <div>
                <Mono className="block text-[8px] text-muted-foreground">
                  RECOMMENDED ACTIONS · ANALYST DECIDES
                </Mono>
                <div className="mt-2 flex flex-col gap-1.5">
                  {voice.recommended_actions.map((a, i) => (
                    <span
                      key={i}
                      className="border border-border px-2 py-1 font-mono text-[9px] tracking-[0.18em] text-technical"
                    >
                      {a.toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : voice && voice.status !== "COMPLETED" && !isActive(voice.status) ? (
          // Honest terminal-but-not-completed states — never fabricate a summary.
          <p className="mt-4 text-[12px] leading-relaxed text-warning">
            {voice.status === "VOICE_ASSESSMENT_PENDING"
              ? "The call ended without a valid structured assessment. No summary is available."
              : voice.status === "UNREACHABLE"
                ? "The customer could not be reached. No conversation took place."
                : "The voice call did not complete. No assessment was recorded."}
          </p>
        ) : (
          <Mono className="mt-6 block text-[8px] leading-relaxed text-muted-foreground">
            CALL SUMMARY IS SHOWN ONLY WHEN THE VOICE SERVICE RETURNS A COMPLETED ASSESSMENT.
          </Mono>
        )}
      </div>
    </div>
  );
}

/* ---- TEMPORARY PROTECTION panel (SCN07 mule-case harness) ---- */

function ProtectionPanel({
  protection,
  voice,
}: {
  protection: ProtectionView;
  voice?: VoiceState | null | undefined;
}) {
  const outcome = outcomeOf(protection.state);
  const outcomeTone =
    outcome === "RELEASED"
      ? "border-lime/60 text-lime"
      : outcome === "HUMAN_REVIEW"
        ? "border-critical/50 text-critical"
        : "border-warning/50 text-warning";
  const outcomeLabel =
    outcome === "RELEASED" ? "RELEASED" : outcome === "HUMAN_REVIEW" ? "HUMAN REVIEW" : "ACTIVE";

  const started = protection.state !== "NORMAL";
  const verify = voice?.verification_status ?? null;
  const customerConfirmation =
    protection.state === "CUSTOMER_CONFIRMED" ||
    protection.state === "BENEFICIARY_UNFROZEN" ||
    protection.state === "INVESTIGATION_CONTINUES"
      ? "YES"
      : protection.state === "CUSTOMER_DENIED"
        ? "NO"
        : "UNCLEAR";

  return (
    <div className="mb-6 border-l-2 border-warning bg-warning/5 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <Mono className="text-[10px] text-warning">TEMPORARY PROTECTION</Mono>
        <Mono className={`border px-2 py-0.5 text-[8px] ${outcomeTone}`}>{outcomeLabel}</Mono>
      </div>
      <Mono className="mt-1 block text-[8px] text-muted-foreground">
        MULE_PATTERN / ACCOUNT DRAIN · PENDING HUMAN REVIEW · NOT A PERMANENT BANK ACTION
      </Mono>

      {!started ? (
        <Mono className="mt-3 block text-[9px] text-muted-foreground">
          NO PROTECTION ACTION TAKEN YET. INITIATE FROM THE VOICE ESCALATION CONTROL BELOW.
        </Mono>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-y-2">
          <Field label="VICTIM ACCOUNT" value={protection.context.victimAccount} />
          <Field
            label="PROTECTED BENEFICIARY"
            value={protection.context.protectedBeneficiary}
            tone="text-warning"
          />
          <Field label="REASON" value="Potential unauthorized account-draining activity" />
          <Field
            label="VOICE VERIFICATION"
            value={verify ? verify.replace(/_/g, " ") : "PENDING"}
            tone={verify === "VERIFIED" ? "text-lime" : "text-warning"}
          />
          <Field label="CUSTOMER CONFIRMATION" value={customerConfirmation} />
          <Field label="PROTECTION STATE" value={protection.state.replace(/_/g, " ")} />
        </div>
      )}

      {/* Human controls — the analyst decides. */}
      {started && outcome !== "RELEASED" ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
          <button
            onClick={protection.onKeep}
            className="border border-critical/50 px-2.5 py-1 font-mono text-[8px] tracking-[0.18em] text-critical transition-colors hover:bg-critical/10"
          >
            [ KEEP PROTECTION ]
          </button>
          <button
            onClick={protection.onRelease}
            className="border border-lime/50 px-2.5 py-1 font-mono text-[8px] tracking-[0.18em] text-lime transition-colors hover:bg-lime-soft"
          >
            [ RELEASE PROTECTION ]
          </button>
          <button
            onClick={protection.onContinue}
            className="border border-border px-2.5 py-1 font-mono text-[8px] tracking-[0.18em] text-technical transition-colors hover:border-lime/60 hover:text-lime"
          >
            [ CONTINUE INVESTIGATION ]
          </button>
        </div>
      ) : null}
      <Mono className="mt-3 block text-[8px] leading-relaxed text-muted-foreground">
        FRAB INITIATED TEMPORARY PROTECTION. THE AML / COMPLIANCE ANALYST MAKES THE FINAL DECISION.
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
    <div className="flex items-center justify-between gap-4">
      <Mono className="text-[8px] text-muted-foreground">{label}</Mono>
      <Mono className={`text-[9px] ${tone}`}>{value}</Mono>
    </div>
  );
}
