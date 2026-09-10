ALTER TABLE "customers" ADD COLUMN "billing_email" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "ship_to_different" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "shipping_address_line1" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "shipping_address_line2" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "shipping_city" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "shipping_state" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "shipping_postal_code" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "shipping_country" text DEFAULT 'US';--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "bill_to_email" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "bill_to_email" text;