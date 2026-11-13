import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { IS_LIVE_BACKEND } from "../../lib/frab-api";
import { useActiveCase, type ActiveCase } from "../../lib/frab-case-state";
import { Dot, Mono } from "./ui";

const frabLogo = "/frab-logo.png";

export const APP_NAV = [
  { no: "01", label: "INTELLIGENCE OVERVIEW", short: "OVERVIEW", to: "/overview" as const },
  { no: "02", label: "ALERT INTELLIGENCE", short: "ALERTS", to: "/alerts" as const },
  { no: "03", label: "INVESTIGATION WORKSPACE", short: "WORKSPACE", to: "/workspace" as const },
  { no: "04", label: "INVESTIGATION RESULT", short: "RESULT", to: "/result" as const },
];

function SystemBlock() {
  const tone = IS_LIVE_BACKEND ? "ok" : "idle";
  const suffix = IS_LIVE_BACKEND ? "" : " · NOT CONNECTED";
  return (
    <div className="border-t border-border px-5 py-5">
      <Link
        to="/"
        className="mb-4 inline-block font-mono text-[9px] tracking-[0.22em] text-muted-foreground transition-colors hover:text-lime"
      >
        ← BACK TO LANDING
      </Link>
      <Mono className="block text-[9px] text-muted-foreground">SYSTEM</Mono>
      <ul className="mt-3 space-y-2">

        {["BANK FEED ACTIVE", "FRAB ONLINE", "TEE VERIFIED"].map((s) => (
          <li key={s} className="flex items-center gap-2">
            <Dot state={tone} />
            <Mono className={`text-[9px] ${IS_LIVE_BACKEND ? "text-foreground" : "text-muted-foreground"}`}>
              {s}
              {suffix}
            </Mono>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NavList({
  onNavigate,
  active,
}: {
  onNavigate?: () => void;
  active: ActiveCase | null;
}) {
  const cls =
    "flex items-start gap-3 border-l-2 border-b border-b-border px-5 py-4 transition-colors";
  const activeProps = { className: "border-l-lime bg-lime-soft text-lime" };
  const inactiveProps = {
    className: "border-l-transparent text-muted-foreground hover:text-foreground",
  };

  return (
    <nav className="flex flex-col">
      {APP_NAV.map((item) => {
        const hint = navHint(item.to, active);
        const body = (
          <>
            <Mono className="text-[9px] opacity-70">{item.no}</Mono>
            <span>
              <Mono className="block text-[10px] leading-relaxed">{item.label}</Mono>
              {hint ? (
                <Mono className="mt-1 block text-[8px] text-muted-foreground">{hint}</Mono>
              ) : null}
            </span>
          </>
        );

        if (item.to === "/workspace" && active) {
          return (
            <Link
              key={item.to}
              to="/investigation/$caseId"
              params={{ caseId: active.caseId }}
              onClick={onNavigate}
              activeProps={activeProps}
              inactiveProps={inactiveProps}
              className={cls}
            >
              {body}
            </Link>
          );
        }
        if (item.to === "/result" && active?.complete) {
          return (
            <Link
              key={item.to}
              to="/case/$caseId"
              params={{ caseId: active.caseId }}
              onClick={onNavigate}
              activeProps={activeProps}
              inactiveProps={inactiveProps}
              className={cls}
            >
              {body}
            </Link>
          );
        }
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            activeProps={activeProps}
            inactiveProps={inactiveProps}
            className={cls}
          >
            {body}
          </Link>
        );
      })}
    </nav>
  );
}

function navHint(to: string, active: ActiveCase | null) {
  if (to === "/workspace") return active ? active.caseId : "NO ACTIVE CASE";
  if (to === "/result")
    return active?.complete ? active.caseId : active ? "INVESTIGATION RUNNING" : "NO COMPLETED CASE";
  return null;
}


export default function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const active = useActiveCase();

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased">
      {/* sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[272px] flex-col border-r border-border bg-surface lg:flex">
        <Link to="/overview" className="flex items-start gap-3 border-b border-border px-5 py-6">
          <img src={frabLogo} alt="FRAB" className="mt-0.5 h-7 w-7 object-contain" />
          <span>
            <Mono className="block text-sm text-lime">FRAB</Mono>
            <Mono className="mt-1.5 block text-[8px] leading-[1.6] text-muted-foreground">
              FINANCIAL CRIME
              <br />
              INVESTIGATION LAB
            </Mono>
          </span>
        </Link>
        <NavList active={active} />
        <div className="mt-auto">
          <SystemBlock />
        </div>
      </aside>

      {/* topbar — tablet / mobile */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/95 px-5 py-3 backdrop-blur-sm lg:hidden">
        <span className="flex items-center gap-2.5">
          <img src={frabLogo} alt="FRAB" className="h-6 w-6 object-contain" />
          <Mono className="text-xs text-lime">FRAB</Mono>
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="border border-border px-3 py-1.5 font-mono text-[9px] tracking-[0.22em] text-foreground"
        >
          {open ? "[ CLOSE ]" : "[ MENU ]"}
        </button>
      </div>
      {open ? (
        <div className="sticky top-[49px] z-30 border-b border-border bg-surface backdrop-blur-sm lg:hidden">
          <NavList onNavigate={() => setOpen(false)} active={active} />
          <SystemBlock />
        </div>
      ) : (
        <div className="sticky top-[49px] z-30 flex gap-0 overflow-x-auto border-b border-border bg-background/95 backdrop-blur-sm lg:hidden">
          {APP_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeProps={{ className: "border-b-lime text-lime" }}
              inactiveProps={{ className: "border-b-transparent text-muted-foreground" }}
              className="whitespace-nowrap border-b-2 px-4 py-3 font-mono text-[9px] tracking-[0.22em]"
            >
              {item.short}
            </Link>
          ))}
        </div>
      )}


      <main className="lg:pl-[272px]">{children}</main>
    </div>
  );
}
