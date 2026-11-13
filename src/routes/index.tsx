import { createFileRoute } from "@tanstack/react-router";
import Hero from "../components/frab/Hero";
import Nav from "../components/frab/Nav";
import { PipelineSection } from "../components/frab/sections/Pipeline";
import { OutputSection } from "../components/frab/sections/Output";
import { Footer } from "../components/frab/sections/Close";
import ActHumanProblem from "../components/frab/story/ActHumanProblem";
import ActGap from "../components/frab/story/ActGap";
import ActReveal from "../components/frab/story/ActReveal";
import ActAgents from "../components/frab/story/ActAgents";
import ActTech from "../components/frab/story/ActTech";
import ActTrust from "../components/frab/story/ActTrust";
import ActImpact from "../components/frab/story/ActImpact";
import ActFinal from "../components/frab/story/ActFinal";

const title = "FRAB — Fraud Response & Autonomous Backbone";
const description =
  "Moving Financial Security from Reactive Protection to Proactive Prevention. FRAB turns suspicious transaction alerts into investigation-ready intelligence: behavior reconstruction, evidence, regulatory risk and audit-ready cases.";

export const Route = createFileRoute("/")({
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
  component: Index,
});

function Index() {
  return (
    <div id="top" className="min-h-screen bg-background font-sans antialiased">
      <Nav />
      <main>
        <Hero />
        <ActHumanProblem />
        <ActGap />
        <ActReveal />
        <PipelineSection />
        <ActAgents />
        <ActTech />
        <OutputSection />
        <ActTrust />
        <ActImpact />
        <ActFinal />
      </main>
      <Footer />
    </div>
  );
}
