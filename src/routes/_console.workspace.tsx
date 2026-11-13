import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import PageHeader from "../components/app/PageHeader";
import { Mono } from "../components/app/ui";
import { useActiveCase } from "../lib/frab-case-state";

const title = "Investigation Workspace — FRAB Investigation Console";
const description =
  "Confidential investigation room for the active FRAB financial-crime case.";

export const Route = createFileRoute("/_console/workspace")({
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
  component: WorkspaceRedirect,
});

function WorkspaceRedirect() {
  const active = useActiveCase();
  const navigate = useNavigate();

  useEffect(() => {
    if (active) void navigate({ to: "/investigation/$caseId", params: { caseId: active.caseId } });
  }, [active, navigate]);

  return (
    <>
      <PageHeader index="03 / INVESTIGATION WORKSPACE" title="Investigation Workspace" />
      <div className="px-6 py-20 md:px-10">
        <div className="max-w-xl border border-border bg-surface p-8">
          <Mono className="text-[9px] text-warning">NO ACTIVE CASE</Mono>
          <p className="mt-4 text-sm text-muted-foreground">
            The workspace opens once an alert has been handed to FRAB. Select an alert in Alert
            Intelligence and initialize the investigation.
          </p>
          <Link
            to="/alerts"
            className="mt-6 inline-block border border-lime/60 bg-lime-soft px-4 py-2.5 font-mono text-[10px] tracking-[0.22em] text-lime"
          >
            [ GO TO ALERT INTELLIGENCE ]
          </Link>
        </div>
      </div>
    </>
  );
}
