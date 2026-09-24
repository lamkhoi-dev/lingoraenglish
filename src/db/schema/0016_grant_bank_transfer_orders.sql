-- Grant table permissions for bank_transfer_orders to service_role, lingora, and authenticated.
-- Fixes "permission denied for table bank_transfer_orders" during checkout.

GRANT ALL ON TABLE "public"."bank_transfer_orders" TO "lingora";
--> statement-breakpoint
GRANT ALL ON TABLE "public"."bank_transfer_orders" TO "service_role";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "public"."bank_transfer_orders" TO "authenticated";
