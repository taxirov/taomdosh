ALTER TABLE "cookbooks" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "deleted_at" timestamp with time zone;