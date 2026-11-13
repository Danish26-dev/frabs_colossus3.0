import { createFileRoute } from "@tanstack/react-router";
import ResultConsole from "../components/app/result/ResultConsole";

const title = "Investigation Result — FRAB Investigation Console";
const description =
  "Evidence-linked forensic case file: risk composition, findings, money trace, regulatory context, audit replay and analyst decision.";

export const Route = createFileRoute("/_console/case/$caseId")({
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
  component: CasePage,
});

function CasePage() {
  const { caseId } = Route.useParams();
  return <ResultConsole caseId={caseId} />;
}
