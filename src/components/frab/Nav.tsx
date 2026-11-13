import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

const frabLogo = "/frab-logo.png";

export const NAV_LINKS = [
  { label: "PROBLEM", href: "#problem" },
  { label: "SOLUTION", href: "#solution" },
  { label: "PIPELINE", href: "#how-it-works" },
  { label: "AGENTS", href: "#agents" },
  { label: "ARCHITECTURE", href: "#architecture" },
  { label: "OUTPUT", href: "#output" },
  { label: "TRUST", href: "#trust" },
  { label: "IMPACT", href: "#impact" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // mobile menu: Escape closes it, and it closes when the viewport grows to desktop
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const mq = window.matchMedia("(min-width: 1280px)");
    const onMq = () => mq.matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => {
      window.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
    };
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b transition-colors duration-500 ${
        scrolled
          ? "border-border bg-background/92 backdrop-blur-sm"
          : "border-transparent bg-background/40"
      }`}
    >
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-6 py-3.5 md:px-14">
        <a href="#top" className="flex items-center gap-2.5">
          <img src={frabLogo} alt="FRAB logo" className="h-6 w-6 object-contain" />
          <span className="font-mono text-sm tracking-[0.3em] text-lime">FRAB</span>
        </a>

        <nav className="hidden items-center gap-6 xl:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="font-mono whitespace-nowrap text-[10px] tracking-[0.24em] text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <Link
            to="/overview"
            className="whitespace-nowrap border border-lime/70 px-4 py-2 font-mono text-[10px] tracking-[0.24em] text-lime transition-colors hover:bg-lime hover:text-background"
          >
            [ ENTER SYSTEM ]
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="frab-mobile-menu"
            onClick={() => setOpen((o) => !o)}
            className="flex h-10 w-10 flex-col items-center justify-center gap-[5px] border border-border text-foreground transition-colors hover:border-lime/60 xl:hidden"
          >
            <span className={`h-px w-4 bg-current transition-transform ${open ? "translate-y-[6px] rotate-45" : ""}`} />
            <span className={`h-px w-4 bg-current transition-opacity ${open ? "opacity-0" : ""}`} />
            <span className={`h-px w-4 bg-current transition-transform ${open ? "-translate-y-[6px] -rotate-45" : ""}`} />
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="frab-mobile-menu"
          aria-label="Sections"
          className="border-t border-border bg-background/95 px-6 pb-5 pt-2 backdrop-blur-sm md:px-14 xl:hidden"
        >
          <ul className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block py-3 font-mono text-[11px] tracking-[0.24em] text-muted-foreground transition-colors hover:text-lime"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
