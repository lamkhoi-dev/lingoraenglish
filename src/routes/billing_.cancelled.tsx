import { createFileRoute } from "@tanstack/react-router";

import { CheckoutCancelledView } from "@/components/lily/checkout-views";
import { en } from "@/locales/en";
import { NOINDEX_META } from "@/lib/seo";

export const Route = createFileRoute("/billing_/cancelled")({
  head: () => ({
    meta: [
      NOINDEX_META,
      { title: en["checkout.cancelled.meta.title"] },
      { name: "description", content: en["checkout.cancelled.meta.description"] },
      { property: "og:title", content: en["checkout.cancelled.meta.title"] },
      { property: "og:description", content: en["checkout.cancelled.meta.description"] },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckoutCancelledView,
});
