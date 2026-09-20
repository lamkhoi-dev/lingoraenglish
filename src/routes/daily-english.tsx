import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The old Daily English page is now Listening Lab. The path is kept so shared
 * links and bookmarks keep working.
 */
export const Route = createFileRoute("/daily-english")({
  beforeLoad: () => {
    // 301, not the default 307: the move is permanent, and only a permanent
    // redirect tells Google to carry the old URL's standing over to the new one.
    throw redirect({ to: "/listening-lab", replace: true, statusCode: 301 });
  },
});
