import { createFileRoute } from "@tanstack/react-router";

import { CheckoutSuccessView } from "@/components/lily/checkout-views";
import { en } from "@/locales/en";

export const Route = createFileRoute("/billing_/success")({
  head: () => ({
    meta: [
      { title: en["checkout.success.meta.title"] },
      { name: "description", content: en["checkout.success.meta.description"] },
      { property: "og:title", content: en["checkout.success.meta.title"] },
      { property: "og:description", content: en["checkout.success.meta.description"] },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckoutSuccessView,
});
