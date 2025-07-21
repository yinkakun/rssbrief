import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/onboarding')({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_app/onboarding"!</div>;
}

// Onboarding: use url param to track onboarding progress
// 1. Name
// 2. Add Content: Subscribe rss feeds or categories
// 3. Set email preferences (e.g., daily, weekly), timezone, etc.
// Get a welcome to RSSBrief email and first entry of summary
// Show congratulations animation, you're ready to keeping it brief!
