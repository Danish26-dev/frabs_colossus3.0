import { createFileRoute } from "@tanstack/react-router";
import AlertIntelligence from "../components/app/alerts/AlertIntelligence";

const title = "Alert Intelligence — FRAB Investigation Console";
const description =
  "Live alert queue and transaction telemetry from the synthetic bank, handed to the FRAB agent pipeline for investigation.";

export const Route = createFileRoute("/_console/alerts")({
  validateSearch: (search: Record<string, unknown>): { alert?: string } => {
    const alert = search["alert"];
    return typeof alert === "string" ? { alert } : {};
  },
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
  component: AlertsPage,
});

function AlertsPage() {
  const { alert } = Route.useSearch();
  return <AlertIntelligence preselect={alert} />;
}
