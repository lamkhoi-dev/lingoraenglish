import { createFileRoute } from "@tanstack/react-router";

import { CheckoutCancelledView } from "@/components/lily/checkout-views";
import { en } from "@/locales/en";

export const Route = createFileRoute("/checkout/cancelled")({
  head: () => ({
    meta: [
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
