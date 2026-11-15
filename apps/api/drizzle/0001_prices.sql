CREATE TYPE "public"."price_sync_status" AS ENUM('ok', 'retry', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "group_ingredient_prices" (
	"group_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"price" bigint NOT NULL,
	"unit" "display_unit" DEFAULT 'kg' NOT NULL,
	"unit_qty" real DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_ingredient_prices_group_id_ingredient_id_pk" PRIMARY KEY("group_id","ingredient_id")
);
--> statement-breakpoint
CREATE TABLE "ingredient_price_links" (
	"ingredient_id" uuid PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"name" text NOT NULL,
	"unit" "display_unit" NOT NULL,
	"unit_qty" real DEFAULT 1 NOT NULL,
	"price" bigint NOT NULL,
	"prev_price" bigint,
	"date" date NOT NULL,
	"source" text DEFAULT 'api' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_sync_runs" (
	"date" date PRIMARY KEY NOT NULL,
	"status" "price_sync_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"source" text DEFAULT 'api' NOT NULL,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "group_ingredient_prices" ADD CONSTRAINT "group_ingredient_prices_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_ingredient_prices" ADD CONSTRAINT "group_ingredient_prices_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_ingredient_prices" ADD CONSTRAINT "group_ingredient_prices_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_price_links" ADD CONSTRAINT "ingredient_price_links_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_snapshots_product_date_uq" ON "price_snapshots" USING btree ("product_id","date");--> statement-breakpoint
CREATE INDEX "price_snapshots_date_idx" ON "price_snapshots" USING btree ("date");