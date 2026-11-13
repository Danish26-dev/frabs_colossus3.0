import { createFileRoute, Outlet } from "@tanstack/react-router";
import AppShell from "../components/app/AppShell";

export const Route = createFileRoute("/_console")({
  component: ConsoleLayout,
});

function ConsoleLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
