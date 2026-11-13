import { useEffect, useState } from "react";
import { IS_LIVE_BACKEND } from "../../lib/frab-api";
import { Dot, Mono } from "./ui";

function Clock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date()
          .toISOString()
          .replace("T", " ")
          .slice(0, 19) + " UTC",
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <Mono className="text-[9px] text-muted-foreground">{now ?? "--:--:--"}</Mono>;
}

const RIGHT = [
  { label: "SYSTEM STATUS", live: "ONLINE" },
  { label: "BANK FEED", live: "ACTIVE" },
  { label: "CONFIDENTIAL WORKSPACE", live: "READY" },
];

export default function PageHeader({ index, title }: { index: string; title: string }) {
  return (
    <header className="border-b border-border px-6 py-6 md:px-12">
      <div className="flex flex-wrap items-start justify-between gap-8">
        <div>
          <Mono className="text-[9px] text-lime">{index}</Mono>
          <h1 className="mt-2 text-2xl font-semibold uppercase tracking-[-0.03em] md:text-3xl">
            {title}
          </h1>
          <Mono className="mt-3 block text-[9px] text-muted-foreground">
            SYNTHETIC BANK / FRAB INVESTIGATION ENVIRONMENT
          </Mono>
        </div>

        <div className="flex flex-col items-start gap-2 md:items-end">
          <Clock />
          {RIGHT.map((r) => (
            <span key={r.label} className="flex items-center gap-2">
              <Mono className="text-[9px] text-muted-foreground">{r.label}</Mono>
              <Dot state={IS_LIVE_BACKEND ? "ok" : "idle"} />
              <Mono className={`text-[9px] ${IS_LIVE_BACKEND ? "text-foreground" : "text-warning"}`}>
                {IS_LIVE_BACKEND ? r.live : "DEMO ENVIRONMENT"}
              </Mono>
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}
