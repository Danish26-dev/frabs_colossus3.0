import { createFileRoute } from "@tanstack/react-router";
import WorkspaceView from "../components/app/workspace/WorkspaceView";

const title = "Investigation Workspace — FRAB Investigation Console";
const description =
  "Confidential investigation room where FRAB's Supervisor, Watchman, Detective, Jurist and Scribe agents work an active financial-crime case.";

export const Route = createFileRoute("/_console/investigation/$caseId")({
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
  component: InvestigationPage,
});

function InvestigationPage() {
  const { caseId } = Route.useParams();
  return <WorkspaceView caseId={caseId} />;
}
