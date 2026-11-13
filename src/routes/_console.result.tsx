import { createFileRoute } from "@tanstack/react-router";
import ResultConsole from "../components/app/result/ResultConsole";

const title = "Investigation Results — FRAB Investigation Console";
const description =
  "All investigated FRAB cases: crime DNA fingerprint, contextual evidence, regulatory risk, audit-ready explanation and analyst decision.";

export const Route = createFileRoute("/_console/result")({
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
  component: ResultsPage,
});

function ResultsPage() {
  return <ResultConsole />;
}
