import { Mono, Node, Note, Reveal, Section, StatusDot, VArrow } from "../primitives";

function Layer({
  tag,
  name,
  children,
}: {
  tag: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal className="border border-border bg-surface/40">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <Mono className="text-[10px] text-lime">{tag}</Mono>
        <Mono className="text-[10px] text-foreground/80">{name}</Mono>
      </div>
      <div className="p-6 md:p-8">{children}</div>
    </Reveal>
  );
}

export function ArchitectureSection() {
  return (
    <Section
      id="architecture"
      label="05 / ARCHITECTURE"
      title={
        <>
          FROM SYNTHETIC BANK
          <br />
          <span className="text-lime">TO PRIVATE INFERENCE.</span>
        </>
      }
      lead="The synthetic bank produces real alerts. The FRAB backend manages the case. The model call runs on 0G Private Computer."
    >
      <div className="grid gap-8 lg:grid-cols-3">
        <Layer tag="A" name="SYNTHETIC BANK">
          <div className="grid grid-cols-2 gap-px bg-border">
            {["CUSTOMERS", "ACCOUNTS", "KYC", "TRANSACTIONS", "BENEFICIARIES", "BEHAVIOR"].map(
              (s) => (
                <div key={s} className="bg-background/40 px-3 py-3.5 text-center">
                  <Mono className="text-[9px] text-foreground/80">{s}</Mono>
                </div>
              ),
            )}
          </div>
          <VArrow />
          <Node title="RULE ENGINE" className="w-full" />
          <VArrow />
          <Node title="ALERT" tone="critical" className="w-full" />

          <div className="mt-7 grid grid-cols-2 gap-px border-t border-border bg-border pt-px">
            {[
              ["300", "CUSTOMERS"],
              ["9,991", "TRANSACTIONS"],
              ["1,105", "BENEFICIARIES"],
              ["10", "ALERT SCENARIOS"],
            ].map(([v, k]) => (
              <div key={k} className="bg-surface/60 px-4 py-4">
                <Mono className="block text-base text-lime">{v}</Mono>
                <Mono className="mt-1.5 block text-[9px] text-muted-foreground">{k}</Mono>
              </div>
            ))}
          </div>
          <Note>SYNTHETIC DEMO ENVIRONMENT</Note>
        </Layer>

        <Layer tag="B" name="FRAB MAIN SYSTEM">
          <div className="flex flex-col items-center">
            <Node title="ALERT" tone="critical" className="w-full" />
            <VArrow />
            <Node title="FRAB BACKEND" tone="lime" className="w-full" />
            <VArrow />
            <Node title="CASE" className="w-full" />
            <VArrow />
            <Node title="INVESTIGATION ORCHESTRATION" className="w-full" />
          </div>
          <ul className="mt-8 space-y-2.5 border-t border-border pt-5">
            {["ALERT INTAKE", "CASE MANAGEMENT", "ORCHESTRATION", "SANITIZED RESULT DELIVERY"].map(
              (s) => (
                <li key={s} className="flex items-center gap-3">
                  <span className="h-px w-4 bg-lime/60" />
                  <Mono className="text-[9px] text-foreground/80">{s}</Mono>
                </li>
              ),
            )}
          </ul>
        </Layer>

        <Layer tag="C" name="INFERENCE">
          <div className="flex flex-col items-center">
            <Node title="FRAB WORKER (CLOUD RUN)" className="w-full" />
            <div className="w-full border border-border bg-background/50 p-3">
              <div className="grid gap-px bg-border">
                {["CALL ESCALATION", "WATCHMAN", "DETECTIVE", "JURIST", "SCRIBE"].map((a) => (
                  <div key={a} className="flex items-center gap-2 bg-surface px-3 py-2">
                    <StatusDot />
                    <Mono className="text-[9px] text-foreground/80">{a}</Mono>
                  </div>
                ))}
              </div>
            </div>
            <VArrow />
            <Node title="HTTPS" className="w-full" />
            <VArrow />
            <Node title="0G PRIVATE COMPUTER" tone="lime" className="w-full" />
          </div>

          <dl className="mt-8 space-y-4 border-t border-border pt-5">
            {[
              ["PRIVATE TRUST MODE", "Only the model call runs on 0G Private Computer, in TEE enclaves as reported by the provider."],
              ["OUTSIDE THE ENCLAVE", "The worker, agents, tools, Firestore, the voice service and this website."],
              ["ATTESTATION", "Not verified by FRAB yet. Planned."],
            ].map(([k, v]) => (
              <div key={k}>
                <Mono className="block text-[9px] text-lime">{k}</Mono>
                <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </Layer>
      </div>
    </Section>
  );
}
