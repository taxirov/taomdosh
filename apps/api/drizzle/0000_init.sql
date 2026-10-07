CREATE TYPE "public"."activity_level" AS ENUM('sedentary', 'light', 'moderate', 'active', 'very_active');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('eating', 'not_eating');--> statement-breakpoint
CREATE TYPE "public"."consent_kind" AS ENUM('health', 'activity', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('android', 'ios');--> statement-breakpoint
CREATE TYPE "public"."display_unit" AS ENUM('g', 'kg', 'ml', 'l', 'pcs', 'tbsp', 'tsp', 'cup', 'pinch', 'to_taste');--> statement-breakpoint
CREATE TYPE "public"."duty_role" AS ENUM('cook', 'dishes', 'shopping');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('groceries', 'utilities', 'other');--> statement-breakpoint
CREATE TYPE "public"."feedback_verdict" AS ENUM('too_much', 'enough', 'not_enough');--> statement-breakpoint
CREATE TYPE "public"."goal" AS ENUM('lose', 'maintain', 'gain');--> statement-breakpoint
CREATE TYPE "public"."group_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."group_type" AS ENUM('family', 'students', 'team');--> statement-breakpoint
CREATE TYPE "public"."ingredient_category" AS ENUM('meat', 'poultry', 'fish', 'dairy', 'eggs', 'vegetables', 'fruits', 'greens', 'grains', 'legumes', 'flour', 'pasta', 'oils', 'spices', 'sauces', 'nuts', 'sweets', 'bakery', 'drinks', 'other');--> statement-breakpoint
CREATE TYPE "public"."meal_status" AS ENUM('planned', 'locked', 'cooked', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."meal_type" AS ENUM('breakfast', 'lunch', 'dinner', 'snack');--> statement-breakpoint
CREATE TYPE "public"."moderation_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."pantry_reason" AS ENUM('purchase', 'cooking', 'manual', 'return');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('active', 'finished', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."shopping_status" AS ENUM('pending', 'bought', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."split_mode" AS ENUM('shared_pot', 'by_portion');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'blocked', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('public', 'group', 'private');--> statement-breakpoint
CREATE TABLE "attendance" (
	"meal_instance_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "attendance_status" DEFAULT 'eating' NOT NULL,
	"guests" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_meal_instance_id_user_id_pk" PRIMARY KEY("meal_instance_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "body_measurements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"measured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"weight_kg" real,
	"height_cm" integer,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "consent_kind" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cookbook_meal_dishes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cookbook_meal_id" uuid NOT NULL,
	"dish_id" uuid NOT NULL,
	"is_side" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cookbook_meals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cookbook_id" uuid NOT NULL,
	"day_index" integer NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"eat_time" text
);
--> statement-breakpoint
CREATE TABLE "cookbook_translations" (
	"cookbook_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	CONSTRAINT "cookbook_translations_cookbook_id_locale_pk" PRIMARY KEY("cookbook_id","locale")
);
--> statement-breakpoint
CREATE TABLE "cookbooks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text,
	"author_id" uuid,
	"visibility" "visibility" DEFAULT 'public' NOT NULL,
	"moderation_status" "moderation_status" DEFAULT 'pending' NOT NULL,
	"days" integer DEFAULT 7 NOT NULL,
	"cover_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cookbooks_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "device_platform" NOT NULL,
	"push_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_push_token_unique" UNIQUE("push_token")
);
--> statement-breakpoint
CREATE TABLE "dish_ingredients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dish_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"qty_g" integer NOT NULL,
	"display_qty" real,
	"display_unit" "display_unit" DEFAULT 'g' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dish_step_translations" (
	"step_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "dish_step_translations_step_id_locale_pk" PRIMARY KEY("step_id","locale")
);
--> statement-breakpoint
CREATE TABLE "dish_steps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dish_id" uuid NOT NULL,
	"n" integer NOT NULL,
	"duration_min" integer,
	"media_url" text
);
--> statement-breakpoint
CREATE TABLE "dish_translations" (
	"dish_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	CONSTRAINT "dish_translations_dish_id_locale_pk" PRIMARY KEY("dish_id","locale")
);
--> statement-breakpoint
CREATE TABLE "dishes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text,
	"parent_dish_id" uuid,
	"cuisine" text DEFAULT 'uzbek' NOT NULL,
	"author_id" uuid,
	"visibility" "visibility" DEFAULT 'public' NOT NULL,
	"group_id" uuid,
	"moderation_status" "moderation_status" DEFAULT 'pending' NOT NULL,
	"active_min" integer NOT NULL,
	"passive_min" integer DEFAULT 0 NOT NULL,
	"prep_ahead_min" integer DEFAULT 0 NOT NULL,
	"base_servings" integer NOT NULL,
	"kcal_per_serving" integer DEFAULT 0 NOT NULL,
	"is_side" boolean DEFAULT false NOT NULL,
	"meal_types" "meal_type"[] DEFAULT '{}'::meal_type[] NOT NULL,
	"image_url" text,
	"video_url" text,
	"favorites_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dishes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "duty_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"date" date NOT NULL,
	"duty_role" "duty_role" NOT NULL,
	"user_id" uuid NOT NULL,
	"is_manual" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "duty_rotations" (
	"group_id" uuid NOT NULL,
	"duty_role" "duty_role" NOT NULL,
	"member_order" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duty_rotations_group_id_duty_role_pk" PRIMARY KEY("group_id","duty_role")
);
--> statement-breakpoint
CREATE TABLE "expense_shares" (
	"expense_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "expense_shares_expense_id_user_id_pk" PRIMARY KEY("expense_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"paid_by" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"category" "expense_category" DEFAULT 'groceries' NOT NULL,
	"note" text,
	"spent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"period_start" date,
	"period_end" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"dish_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_dish_id_pk" PRIMARY KEY("user_id","dish_id")
);
--> statement-breakpoint
CREATE TABLE "group_meal_settings" (
	"group_id" uuid NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"share" real NOT NULL,
	"default_time" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "group_meal_settings_group_id_meal_type_pk" PRIMARY KEY("group_id","meal_type")
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "group_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "group_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"cookbook_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"status" "plan_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "group_type" NOT NULL,
	"split_mode" "split_mode" NOT NULL,
	"home_region" text DEFAULT 'uz' NOT NULL,
	"country" char(2) DEFAULT 'UZ' NOT NULL,
	"currency" char(3) DEFAULT 'UZS' NOT NULL,
	"timezone" text DEFAULT 'Asia/Tashkent' NOT NULL,
	"invite_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "ingredient_translations" (
	"ingredient_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "ingredient_translations_ingredient_id_locale_pk" PRIMARY KEY("ingredient_id","locale")
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"category" "ingredient_category" NOT NULL,
	"kcal_100g" real NOT NULL,
	"protein_100g" real NOT NULL,
	"fat_100g" real NOT NULL,
	"carb_100g" real NOT NULL,
	"piece_weight_g" integer,
	"density" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredients_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "meal_feedback" (
	"meal_instance_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"verdict" "feedback_verdict" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_feedback_meal_instance_id_user_id_pk" PRIMARY KEY("meal_instance_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "meal_instance_dishes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"meal_instance_id" uuid NOT NULL,
	"dish_id" uuid NOT NULL,
	"is_side" boolean DEFAULT false NOT NULL,
	"total_servings" real
);
--> statement-breakpoint
CREATE TABLE "meal_instances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"plan_id" uuid,
	"date" date NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"eat_at" timestamp with time zone NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"lock_at" timestamp with time zone NOT NULL,
	"prep_at" timestamp with time zone,
	"status" "meal_status" DEFAULT 'planned' NOT NULL,
	"cook_user_id" uuid,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_portions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"meal_instance_id" uuid NOT NULL,
	"dish_id" uuid NOT NULL,
	"user_id" uuid,
	"host_user_id" uuid,
	"factor" real NOT NULL,
	"grams" integer NOT NULL,
	"kcal" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nutrition_targets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"kcal" integer NOT NULL,
	"protein_g" integer NOT NULL,
	"fat_g" integer NOT NULL,
	"carb_g" integer NOT NULL,
	"formula_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pantry_items" (
	"group_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"qty_g" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pantry_items_group_id_ingredient_id_pk" PRIMARY KEY("group_id","ingredient_id")
);
--> statement-breakpoint
CREATE TABLE "pantry_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"delta_g" integer NOT NULL,
	"reason" "pantry_reason" NOT NULL,
	"ref_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portion_factors" (
	"user_id" uuid NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"factor" real DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portion_factors_user_id_meal_type_pk" PRIMARY KEY("user_id","meal_type")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"device_name" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"from_user" uuid NOT NULL,
	"to_user" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"qty_g" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"assignee_id" uuid,
	"status" "shopping_status" DEFAULT 'pending' NOT NULL,
	"is_manual" boolean DEFAULT false NOT NULL,
	"bought_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"birth_date" date,
	"sex" "sex",
	"height_cm" integer,
	"weight_kg" real,
	"activity_level" "activity_level" DEFAULT 'light' NOT NULL,
	"goal" "goal" DEFAULT 'maintain' NOT NULL,
	"target_weight_kg" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" text,
	"name" text NOT NULL,
	"locale" text DEFAULT 'uz' NOT NULL,
	"home_region" text DEFAULT 'uz' NOT NULL,
	"country" char(2) DEFAULT 'UZ' NOT NULL,
	"managed_by" uuid,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_meal_instance_id_meal_instances_id_fk" FOREIGN KEY ("meal_instance_id") REFERENCES "public"."meal_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook_meal_dishes" ADD CONSTRAINT "cookbook_meal_dishes_cookbook_meal_id_cookbook_meals_id_fk" FOREIGN KEY ("cookbook_meal_id") REFERENCES "public"."cookbook_meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook_meal_dishes" ADD CONSTRAINT "cookbook_meal_dishes_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook_meals" ADD CONSTRAINT "cookbook_meals_cookbook_id_cookbooks_id_fk" FOREIGN KEY ("cookbook_id") REFERENCES "public"."cookbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbook_translations" ADD CONSTRAINT "cookbook_translations_cookbook_id_cookbooks_id_fk" FOREIGN KEY ("cookbook_id") REFERENCES "public"."cookbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookbooks" ADD CONSTRAINT "cookbooks_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_step_translations" ADD CONSTRAINT "dish_step_translations_step_id_dish_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."dish_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_steps" ADD CONSTRAINT "dish_steps_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_translations" ADD CONSTRAINT "dish_translations_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_rotations" ADD CONSTRAINT "duty_rotations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_meal_settings" ADD CONSTRAINT "group_meal_settings_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_plans" ADD CONSTRAINT "group_plans_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_plans" ADD CONSTRAINT "group_plans_cookbook_id_cookbooks_id_fk" FOREIGN KEY ("cookbook_id") REFERENCES "public"."cookbooks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_translations" ADD CONSTRAINT "ingredient_translations_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_feedback" ADD CONSTRAINT "meal_feedback_meal_instance_id_meal_instances_id_fk" FOREIGN KEY ("meal_instance_id") REFERENCES "public"."meal_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_feedback" ADD CONSTRAINT "meal_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_instance_dishes" ADD CONSTRAINT "meal_instance_dishes_meal_instance_id_meal_instances_id_fk" FOREIGN KEY ("meal_instance_id") REFERENCES "public"."meal_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_instance_dishes" ADD CONSTRAINT "meal_instance_dishes_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_instances" ADD CONSTRAINT "meal_instances_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_instances" ADD CONSTRAINT "meal_instances_plan_id_group_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."group_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_instances" ADD CONSTRAINT "meal_instances_cook_user_id_users_id_fk" FOREIGN KEY ("cook_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_portions" ADD CONSTRAINT "meal_portions_meal_instance_id_meal_instances_id_fk" FOREIGN KEY ("meal_instance_id") REFERENCES "public"."meal_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_portions" ADD CONSTRAINT "meal_portions_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_portions" ADD CONSTRAINT "meal_portions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_portions" ADD CONSTRAINT "meal_portions_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_targets" ADD CONSTRAINT "nutrition_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_movements" ADD CONSTRAINT "pantry_movements_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_movements" ADD CONSTRAINT "pantry_movements_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portion_factors" ADD CONSTRAINT "portion_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_from_user_users_id_fk" FOREIGN KEY ("from_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_to_user_users_id_fk" FOREIGN KEY ("to_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "body_measurements_user_idx" ON "body_measurements" USING btree ("user_id","measured_at");--> statement-breakpoint
CREATE INDEX "consents_user_idx" ON "consents" USING btree ("user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "cookbook_meals_uq" ON "cookbook_meals" USING btree ("cookbook_id","day_index","meal_type");--> statement-breakpoint
CREATE INDEX "dish_ingredients_dish_idx" ON "dish_ingredients" USING btree ("dish_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dish_steps_uq" ON "dish_steps" USING btree ("dish_id","n");--> statement-breakpoint
CREATE INDEX "dishes_visibility_idx" ON "dishes" USING btree ("visibility","moderation_status");--> statement-breakpoint
CREATE INDEX "dishes_group_idx" ON "dishes" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "duty_assignments_uq" ON "duty_assignments" USING btree ("group_id","date","duty_role");--> statement-breakpoint
CREATE INDEX "expenses_group_idx" ON "expenses" USING btree ("group_id","spent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "group_members_group_user_uq" ON "group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "group_members_user_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "group_plans_group_idx" ON "group_plans" USING btree ("group_id","week_start");--> statement-breakpoint
CREATE INDEX "meal_instance_dishes_meal_idx" ON "meal_instance_dishes" USING btree ("meal_instance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_instances_uq" ON "meal_instances" USING btree ("group_id","date","meal_type");--> statement-breakpoint
CREATE INDEX "meal_instances_lock_idx" ON "meal_instances" USING btree ("status","lock_at");--> statement-breakpoint
CREATE INDEX "meal_portions_meal_idx" ON "meal_portions" USING btree ("meal_instance_id");--> statement-breakpoint
CREATE INDEX "nutrition_targets_user_idx" ON "nutrition_targets" USING btree ("user_id","valid_from");--> statement-breakpoint
CREATE INDEX "pantry_movements_group_idx" ON "pantry_movements" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "settlements_group_idx" ON "settlements" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "shopping_items_group_idx" ON "shopping_items" USING btree ("group_id","period_start");