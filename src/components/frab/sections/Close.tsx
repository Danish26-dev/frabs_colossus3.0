import { Link } from "@tanstack/react-router";
import { CtaSecondary, Mono, Reveal, StatusDot } from "../primitives";
import { NAV_LINKS } from "../Nav";

export function FinalCta() {
  return (
    <section id="demo" className="border-t border-border">
      <div className="mx-auto max-w-[1440px] px-6 py-28 md:px-14 lg:py-36">
        <Reveal>
          <h2 className="max-w-4xl text-[clamp(1.9rem,4.4vw,3.6rem)] font-semibold uppercase leading-[0.96] tracking-[-0.04em] text-foreground">
            AN ALERT TELLS YOU
            <br />
            SOMETHING IS UNUSUAL.
            <br />
            <span className="text-lime">FRAB TELLS YOU WHY.</span>
          </h2>
        </Reveal>
        <Reveal delay={160}>
          <div className="mt-12 flex flex-wrap gap-4">
            <Link
              to="/overview"
              className="group inline-flex items-center gap-3 bg-lime px-6 py-3.5 font-mono text-[11px] tracking-[0.24em] text-background transition-opacity hover:opacity-85"
            >
              ENTER THE INVESTIGATION
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
            <Link
              to="/workspace"
              className="inline-flex items-center gap-3 border border-border px-6 py-3.5 font-mono text-[11px] tracking-[0.24em] text-foreground/80 transition-colors hover:border-lime/60 hover:text-lime"
            >
              OPEN INVESTIGATION WORKSPACE
            </Link>
            <CtaSecondary href="#architecture">VIEW ARCHITECTURE</CtaSecondary>
          </div>
        </Reveal>

        <Reveal delay={220}>
          <div className="mt-20 grid gap-px border-t border-border bg-border md:grid-cols-2">
            <div className="bg-background px-6 py-8">
              <Mono className="block text-sm text-lime">FRAB</Mono>
              <Mono className="mt-2 block text-[9px] text-muted-foreground">
                FRAUD RESPONSE &amp; AUTONOMOUS BACKBONE
              </Mono>
            </div>
            <div className="bg-background px-6 py-8">
              <Mono className="block text-sm text-foreground">AUTONOMOUS INVESTIGATION</Mono>
              <Mono className="mt-2 block text-[9px] text-muted-foreground">
                EVIDENCE-BACKED CASES FOR THE HUMAN ANALYST TO DECIDE
              </Mono>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-[1440px] px-6 py-12 md:px-14">
        <div className="flex flex-wrap items-start justify-between gap-10">
          <div>
            <Mono className="block text-sm text-lime">FRAB</Mono>
            <Mono className="mt-2 block text-[9px] text-muted-foreground">
              FRAUD RESPONSE &amp; AUTONOMOUS BACKBONE
            </Mono>
            <p className="mt-3 max-w-xs text-[11px] leading-relaxed text-muted-foreground">
              Moving Financial Security from Reactive Protection to Proactive Prevention.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-8 gap-y-3">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="font-mono text-[9px] tracking-[0.24em] text-muted-foreground transition-colors hover:text-lime"
              >
                {l.label}
              </a>
            ))}
            <Link
              to="/overview"
              className="font-mono text-[9px] tracking-[0.24em] text-lime transition-colors hover:opacity-80"
            >
              INTELLIGENCE CONSOLE
            </Link>
          </nav>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
          <Mono className="text-[9px] text-muted-foreground">SYNTHETIC DATA · PROTOTYPE</Mono>
          <span className="inline-flex items-center gap-2">
            <StatusDot />
            <Mono className="text-[9px] text-muted-foreground">
              INVESTIGATION SYSTEM / v1.0
            </Mono>
          </span>
        </div>
      </div>
    </footer>
  );
}
