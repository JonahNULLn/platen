ALTER TABLE "invoices" ADD COLUMN "purchase_order" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "approved_by_name" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "purchase_order" text;