CREATE TABLE "packing_slips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"invoice_id" uuid,
	"created_by" uuid,
	"ship_date" date,
	"note_title" text,
	"note_body" text,
	"footer_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packing_slips_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
ALTER TABLE "packing_slips" ADD CONSTRAINT "packing_slips_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packing_slips" ADD CONSTRAINT "packing_slips_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packing_slips" ADD CONSTRAINT "packing_slips_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packing_slips" ADD CONSTRAINT "packing_slips_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "packing_slips_tenant_id_idx" ON "packing_slips" USING btree ("tenant_id");--> statement-breakpoint

-- ════════════════════════════════════════════════════════════════════
-- updated_at trigger + RLS (same shape as every other business table)
-- ════════════════════════════════════════════════════════════════════
CREATE TRIGGER packing_slips_set_updated_at
  BEFORE UPDATE ON public.packing_slips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
ALTER TABLE public.packing_slips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read packing_slips" ON public.packing_slips FOR SELECT
  USING (tenant_id IN (SELECT organization_id FROM public.memberships WHERE user_id = auth.uid()));
CREATE POLICY "Members insert packing_slips" ON public.packing_slips FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT organization_id FROM public.memberships WHERE user_id = auth.uid()));
CREATE POLICY "Members update packing_slips" ON public.packing_slips FOR UPDATE
  USING (tenant_id IN (SELECT organization_id FROM public.memberships WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT organization_id FROM public.memberships WHERE user_id = auth.uid()));
CREATE POLICY "Members delete packing_slips" ON public.packing_slips FOR DELETE
  USING (tenant_id IN (SELECT organization_id FROM public.memberships WHERE user_id = auth.uid()));
