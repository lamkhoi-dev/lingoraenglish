import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The old Daily English page is now Listening Lab. The path is kept so shared
 * links and bookmarks keep working.
 */
export const Route = createFileRoute("/daily-english")({
  beforeLoad: () => {
    throw redirect({ to: "/listening-lab", replace: true });
  },
});
