ALTER TABLE "invoices" ADD COLUMN "shipping_mode" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "shipping_cap" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "shipping_actual" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "tracking_number" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "shipping_mode" text DEFAULT 'standard' NOT NULL;