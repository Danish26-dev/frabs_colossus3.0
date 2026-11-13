import { createFileRoute } from "@tanstack/react-router";
import PageHeader from "../components/app/PageHeader";
import { AnalyticsOverview } from "../components/app/overview/Analytics";
import { BankActivity, BankEnvironment, DatasetSection } from "../components/app/overview/Sections";
import { DataExplorer } from "../components/app/overview/DataExplorer";

const title = "Intelligence Overview — FRAB Investigation Console";
const description =
  "Command center for the FRAB synthetic banking environment: dataset telemetry, live transaction activity, rule-engine alerts and investigation status.";

export const Route = createFileRoute("/_console/overview")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OverviewPage,
});

function OverviewPage() {
  return (
    <>
      <PageHeader index="01 / INTELLIGENCE OVERVIEW" title="Intelligence Overview" />
      {/* Judge-first: real backend-driven analytics lead the page. */}
      <AnalyticsOverview />
      {/* Supporting live context below the intelligence layer. */}
      <DatasetSection />
      <DataExplorer />
      <BankActivity />
      <BankEnvironment />
      <footer className="px-6 py-10 md:px-12">
        <Mono />
      </footer>
    </>
  );
}

function Mono() {
  return (
    <p className="font-mono text-[9px] tracking-[0.22em] text-muted-foreground">
      FRAB · FRAUD RESPONSE &amp; AUTONOMOUS BACKBONE · SYNTHETIC DEMO ENVIRONMENT
    </p>
  );
}
