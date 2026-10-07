/**
 * Taomdosh — MVP ma'lumotlar bazasi sxemasi (Drizzle ORM, PostgreSQL 16).
 * "Taomdosh — System design va Database dizayn" hujjatiga mos:
 *   1. Foydalanuvchi va sog'liq   2. Guruh va navbatchilik   3. Kontent: taom va cookbook
 *   4. Guruh rejasi va mahallar   5. Xarid, zaxira va xarajat
 * 6-domen (marketplace, kurslar, stories) keyingi bosqichda qo'shiladi.
 *
 * Qoidalar: kalitlar UUID v7; pul — butun so'm (bigint); og'irlik — gramm (integer);
 * o'lchovlar va zaxira harakati faqat qo'shiladigan yozuvlar (ledger).
 */
import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from '../common/uuid';

// ───────────────────────── yordamchilar ─────────────────────────

const id = () => uuid('id').primaryKey().$defaultFn(uuidv7);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const tsz = (name: string) => timestamp(name, { withTimezone: true });
const day = (name: string) => date(name, { mode: 'string' }); // 'YYYY-MM-DD'
const money = (name: string) => bigint(name, { mode: 'number' }); // so'mda

// ───────────────────────── enums ─────────────────────────

export const userStatus = pgEnum('user_status', ['active', 'blocked', 'deleted']);
export const sexEnum = pgEnum('sex', ['male', 'female']);
export const activityLevel = pgEnum('activity_level', ['sedentary', 'light', 'moderate', 'active', 'very_active']);
export const goalEnum = pgEnum('goal', ['lose', 'maintain', 'gain']);
export const consentKind = pgEnum('consent_kind', ['health', 'activity', 'marketing']);
export const devicePlatform = pgEnum('device_platform', ['android', 'ios']);
export const groupType = pgEnum('group_type', ['family', 'students', 'team']);
/** shared_pot — oila: umumiy qozon; by_portion — talabalar, jamoa: kim qancha yegan bo'lsa */
export const splitMode = pgEnum('split_mode', ['shared_pot', 'by_portion']);
export const groupRole = pgEnum('group_role', ['admin', 'member']);
export const mealType = pgEnum('meal_type', ['breakfast', 'lunch', 'dinner', 'snack']);
export const dutyRole = pgEnum('duty_role', ['cook', 'dishes', 'shopping']);
export const visibility = pgEnum('visibility', ['public', 'group', 'private']);
export const moderationStatus = pgEnum('moderation_status', ['pending', 'approved', 'rejected']);
export const ingredientCategory = pgEnum('ingredient_category', [
  'meat', 'poultry', 'fish', 'dairy', 'eggs', 'vegetables', 'fruits', 'greens', 'grains', 'legumes',
  'flour', 'pasta', 'oils', 'spices', 'sauces', 'nuts', 'sweets', 'bakery', 'drinks', 'other',
]);
export const displayUnit = pgEnum('display_unit', ['g', 'kg', 'ml', 'l', 'pcs', 'tbsp', 'tsp', 'cup', 'pinch', 'to_taste']);
export const planStatus = pgEnum('plan_status', ['active', 'finished', 'cancelled']);
export const mealStatus = pgEnum('meal_status', ['planned', 'locked', 'cooked', 'cancelled']);
export const attendanceStatus = pgEnum('attendance_status', ['eating', 'not_eating']);
export const feedbackVerdict = pgEnum('feedback_verdict', ['too_much', 'enough', 'not_enough']);
export const pantryReason = pgEnum('pantry_reason', ['purchase', 'cooking', 'manual', 'return']);
export const shoppingStatus = pgEnum('shopping_status', ['pending', 'bought', 'skipped']);
export const expenseCategory = pgEnum('expense_category', ['groceries', 'utilities', 'other']);

export type MealType = (typeof mealType.enumValues)[number];
export type DutyRole = (typeof dutyRole.enumValues)[number];
export type GroupType = (typeof groupType.enumValues)[number];
export type SplitMode = (typeof splitMode.enumValues)[number];
export type ActivityLevel = (typeof activityLevel.enumValues)[number];
export type Goal = (typeof goalEnum.enumValues)[number];
export type Sex = (typeof sexEnum.enumValues)[number];

// ─────────────── 1. Foydalanuvchi va sog'liq ───────────────

export const users = pgTable('users', {
  id: id(),
  phone: text('phone').unique(), // E.164; bolalar va telefonsiz a'zolarda bo'sh
  name: text('name').notNull(),
  locale: text('locale').notNull().default('uz'), // uz | uz-Cyrl | ru | en
  homeRegion: text('home_region').notNull().default('uz'),
  country: char('country', { length: 2 }).notNull().default('UZ'),
  managedBy: uuid('managed_by'), // boshqariladigan hisob (bola) egasi
  status: userStatus('status').notNull().default('active'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  birthDate: day('birth_date'),
  sex: sexEnum('sex'),
  heightCm: integer('height_cm'),
  weightKg: real('weight_kg'), // joriy vazn; tarix body_measurements da
  activityLevel: activityLevel('activity_level').notNull().default('light'),
  goal: goalEnum('goal').notNull().default('maintain'),
  targetWeightKg: real('target_weight_kg'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const bodyMeasurements = pgTable(
  'body_measurements',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    measuredAt: tsz('measured_at').notNull().defaultNow(),
    weightKg: real('weight_kg'),
    heightCm: integer('height_cm'),
    source: text('source').notNull().default('manual'),
    createdAt: createdAt(),
  },
  (t) => [index('body_measurements_user_idx').on(t.userId, t.measuredAt)],
);

export const nutritionTargets = pgTable(
  'nutrition_targets',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    validFrom: tsz('valid_from').notNull().defaultNow(),
    kcal: integer('kcal').notNull(),
    proteinG: integer('protein_g').notNull(),
    fatG: integer('fat_g').notNull(),
    carbG: integer('carb_g').notNull(),
    formulaVersion: text('formula_version').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('nutrition_targets_user_idx').on(t.userId, t.validFrom)],
);

/** O'rganilgan shaxsiy porsiya koeffitsienti kᵢ (0.7–1.3) */
export const portionFactors = pgTable(
  'portion_factors',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    mealType: mealType('meal_type').notNull(),
    factor: real('factor').notNull().default(1),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.mealType] })],
);

export const consents = pgTable(
  'consents',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: consentKind('kind').notNull(),
    grantedAt: tsz('granted_at').notNull().defaultNow(),
    revokedAt: tsz('revoked_at'),
  },
  (t) => [index('consents_user_idx').on(t.userId, t.kind)],
);

export const devices = pgTable('devices', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  platform: devicePlatform('platform').notNull(),
  pushToken: text('push_token').notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Refresh token — qurilma bo'yicha sessiya; bazada faqat xeshi saqlanadi */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    deviceName: text('device_name'),
    expiresAt: tsz('expires_at').notNull(),
    revokedAt: tsz('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [index('refresh_tokens_user_idx').on(t.userId)],
);

// ─────────────── 2. Guruh va navbatchilik ───────────────

export const groups = pgTable('groups', {
  id: id(),
  name: text('name').notNull(),
  type: groupType('type').notNull(),
  splitMode: splitMode('split_mode').notNull(),
  homeRegion: text('home_region').notNull().default('uz'),
  country: char('country', { length: 2 }).notNull().default('UZ'),
  currency: char('currency', { length: 3 }).notNull().default('UZS'),
  timezone: text('timezone').notNull().default('Asia/Tashkent'),
  inviteCode: text('invite_code').notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const groupMembers = pgTable(
  'group_members',
  {
    id: id(),
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: groupRole('role').notNull().default('member'),
    joinedAt: tsz('joined_at').notNull().defaultNow(),
    leftAt: tsz('left_at'),
  },
  (t) => [uniqueIndex('group_members_group_user_uq').on(t.groupId, t.userId), index('group_members_user_idx').on(t.userId)],
);

/** Mahal ulushi (sₘ) va standart ovqat vaqti */
export const groupMealSettings = pgTable(
  'group_meal_settings',
  {
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    mealType: mealType('meal_type').notNull(),
    share: real('share').notNull(),
    defaultTime: text('default_time').notNull(), // "HH:MM" guruh vaqt zonasida
    enabled: boolean('enabled').notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.mealType] })],
);

/** Avtomatik aylanish tartibi: memberOrder — user_id lar ketma-ketligi */
export const dutyRotations = pgTable(
  'duty_rotations',
  {
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    dutyRole: dutyRole('duty_role').notNull(),
    memberOrder: uuid('member_order').array().notNull().default(sql`'{}'::uuid[]`),
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.dutyRole] })],
);

export const dutyAssignments = pgTable(
  'duty_assignments',
  {
    id: id(),
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    date: day('date').notNull(),
    dutyRole: dutyRole('duty_role').notNull(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    isManual: boolean('is_manual').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('duty_assignments_uq').on(t.groupId, t.date, t.dutyRole)],
);

// ─────────────── 3. Kontent: taom va cookbook ───────────────

export const ingredients = pgTable('ingredients', {
  id: id(),
  slug: text('slug').notNull().unique(),
  category: ingredientCategory('category').notNull(),
  kcal100g: real('kcal_100g').notNull(),
  protein100g: real('protein_100g').notNull(),
  fat100g: real('fat_100g').notNull(),
  carb100g: real('carb_100g').notNull(),
  pieceWeightG: integer('piece_weight_g'), // 1 dona necha gramm (tuxum, piyoz)
  density: real('density'), // g/ml — suyuqliklar uchun
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const ingredientTranslations = pgTable(
  'ingredient_translations',
  {
    ingredientId: uuid('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(), // uz | ru | en (uz-Cyrl lotindan avtomatik)
    name: text('name').notNull(),
  },
  (t) => [primaryKey({ columns: [t.ingredientId, t.locale] })],
);

export const dishes = pgTable(
  'dishes',
  {
    id: id(),
    slug: text('slug').unique(),
    parentDishId: uuid('parent_dish_id'), // asosiy taom + variantlar
    cuisine: text('cuisine').notNull().default('uzbek'),
    authorId: uuid('author_id').references(() => users.id), // null — platforma
    visibility: visibility('visibility').notNull().default('public'),
    groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    moderationStatus: moderationStatus('moderation_status').notNull().default('pending'),
    activeMin: integer('active_min').notNull(),
    passiveMin: integer('passive_min').notNull().default(0),
    prepAheadMin: integer('prep_ahead_min').notNull().default(0), // ivitish, marinad
    baseServings: integer('base_servings').notNull(),
    kcalPerServing: integer('kcal_per_serving').notNull().default(0), // masalliqlardan avtomatik
    isSide: boolean('is_side').notNull().default(false), // salat, qo'shimcha
    mealTypes: mealType('meal_types').array().notNull().default(sql`'{}'::meal_type[]`),
    imageUrl: text('image_url'),
    videoUrl: text('video_url'),
    favoritesCount: integer('favorites_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('dishes_visibility_idx').on(t.visibility, t.moderationStatus), index('dishes_group_idx').on(t.groupId)],
);

export const dishTranslations = pgTable(
  'dish_translations',
  {
    dishId: uuid('dish_id').notNull().references(() => dishes.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    title: text('title').notNull(),
    description: text('description'),
  },
  (t) => [primaryKey({ columns: [t.dishId, t.locale] })],
);

export const dishIngredients = pgTable(
  'dish_ingredients',
  {
    id: id(),
    dishId: uuid('dish_id').notNull().references(() => dishes.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id').notNull().references(() => ingredients.id),
    qtyG: integer('qty_g').notNull(), // base_servings uchun, grammda
    displayQty: real('display_qty'),
    displayUnit: displayUnit('display_unit').notNull().default('g'),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('dish_ingredients_dish_idx').on(t.dishId)],
);

export const dishSteps = pgTable(
  'dish_steps',
  {
    id: id(),
    dishId: uuid('dish_id').notNull().references(() => dishes.id, { onDelete: 'cascade' }),
    n: integer('n').notNull(),
    durationMin: integer('duration_min'),
    mediaUrl: text('media_url'),
  },
  (t) => [uniqueIndex('dish_steps_uq').on(t.dishId, t.n)],
);

export const dishStepTranslations = pgTable(
  'dish_step_translations',
  {
    stepId: uuid('step_id').notNull().references(() => dishSteps.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    text: text('text').notNull(),
  },
  (t) => [primaryKey({ columns: [t.stepId, t.locale] })],
);

export const favorites = pgTable(
  'favorites',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    dishId: uuid('dish_id').notNull().references(() => dishes.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.dishId] })],
);

export const cookbooks = pgTable('cookbooks', {
  id: id(),
  slug: text('slug').unique(),
  authorId: uuid('author_id').references(() => users.id), // null — platforma
  visibility: visibility('visibility').notNull().default('public'),
  moderationStatus: moderationStatus('moderation_status').notNull().default('pending'),
  days: integer('days').notNull().default(7),
  coverUrl: text('cover_url'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const cookbookTranslations = pgTable(
  'cookbook_translations',
  {
    cookbookId: uuid('cookbook_id').notNull().references(() => cookbooks.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    title: text('title').notNull(),
    description: text('description'),
  },
  (t) => [primaryKey({ columns: [t.cookbookId, t.locale] })],
);

export const cookbookMeals = pgTable(
  'cookbook_meals',
  {
    id: id(),
    cookbookId: uuid('cookbook_id').notNull().references(() => cookbooks.id, { onDelete: 'cascade' }),
    dayIndex: integer('day_index').notNull(), // 0 = dushanba
    mealType: mealType('meal_type').notNull(),
    eatTime: text('eat_time'), // "HH:MM"; bo'sh — guruh sozlamasi
  },
  (t) => [uniqueIndex('cookbook_meals_uq').on(t.cookbookId, t.dayIndex, t.mealType)],
);

export const cookbookMealDishes = pgTable('cookbook_meal_dishes', {
  id: id(),
  cookbookMealId: uuid('cookbook_meal_id').notNull().references(() => cookbookMeals.id, { onDelete: 'cascade' }),
  dishId: uuid('dish_id').notNull().references(() => dishes.id),
  isSide: boolean('is_side').notNull().default(false),
});

// ─────────────── 4. Guruh rejasi va kundalik mahallar ───────────────

export const groupPlans = pgTable(
  'group_plans',
  {
    id: id(),
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    cookbookId: uuid('cookbook_id').notNull().references(() => cookbooks.id),
    weekStart: day('week_start').notNull(),
    status: planStatus('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('group_plans_group_idx').on(t.groupId, t.weekStart)],
);

export const mealInstances = pgTable(
  'meal_instances',
  {
    id: id(),
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').references(() => groupPlans.id, { onDelete: 'cascade' }),
    date: day('date').notNull(),
    mealType: mealType('meal_type').notNull(),
    eatAt: tsz('eat_at').notNull(),
    startAt: tsz('start_at').notNull(), // pishirish boshlanishi = qulflash
    remindAt: tsz('remind_at').notNull(),
    lockAt: tsz('lock_at').notNull(),
    prepAt: tsz('prep_at'), // oldindan tayyorgarlik eslatmasi
    status: mealStatus('status').notNull().default('planned'),
    cookUserId: uuid('cook_user_id').references(() => users.id),
    lockedAt: tsz('locked_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('meal_instances_uq').on(t.groupId, t.date, t.mealType),
    index('meal_instances_lock_idx').on(t.status, t.lockAt),
  ],
);

export const mealInstanceDishes = pgTable(
  'meal_instance_dishes',
  {
    id: id(),
    mealInstanceId: uuid('meal_instance_id').notNull().references(() => mealInstances.id, { onDelete: 'cascade' }),
    dishId: uuid('dish_id').notNull().references(() => dishes.id),
    isSide: boolean('is_side').notNull().default(false),
    totalServings: real('total_servings'), // qulflashda to'ldiriladi
  },
  (t) => [index('meal_instance_dishes_meal_idx').on(t.mealInstanceId)],
);

export const attendance = pgTable(
  'attendance',
  {
    mealInstanceId: uuid('meal_instance_id').notNull().references(() => mealInstances.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: attendanceStatus('status').notNull().default('eating'),
    guests: integer('guests').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.mealInstanceId, t.userId] })],
);

/** Qulflashda muzlatilgan porsiya. Mehmon porsiyasida user_id bo'sh, host_user_id — olib kelgan a'zo. */
export const mealPortions = pgTable(
  'meal_portions',
  {
    id: id(),
    mealInstanceId: uuid('meal_instance_id').notNull().references(() => mealInstances.id, { onDelete: 'cascade' }),
    dishId: uuid('dish_id').notNull().references(() => dishes.id),
    userId: uuid('user_id').references(() => users.id),
    hostUserId: uuid('host_user_id').references(() => users.id),
    factor: real('factor').notNull(), // standart porsiyaga nisbatan (Pᵢ)
    grams: integer('grams').notNull(),
    kcal: integer('kcal').notNull(),
  },
  (t) => [index('meal_portions_meal_idx').on(t.mealInstanceId)],
);

export const mealFeedback = pgTable(
  'meal_feedback',
  {
    mealInstanceId: uuid('meal_instance_id').notNull().references(() => mealInstances.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    verdict: feedbackVerdict('verdict').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.mealInstanceId, t.userId] })],
);

// ─────────────── 5. Xarid, zaxira va xarajat ───────────────

export const pantryItems = pgTable(
  'pantry_items',
  {
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id').notNull().references(() => ingredients.id),
    qtyG: integer('qty_g').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.ingredientId] })],
);

/** Ledger: zaxira harakatlari faqat qo'shiladi */
export const pantryMovements = pgTable(
  'pantry_movements',
  {
    id: id(),
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id').notNull().references(() => ingredients.id),
    deltaG: integer('delta_g').notNull(),
    reason: pantryReason('reason').notNull(),
    refId: uuid('ref_id'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('pantry_movements_group_idx').on(t.groupId, t.createdAt)],
);

export const shoppingItems = pgTable(
  'shopping_items',
  {
    id: id(),
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id').notNull().references(() => ingredients.id),
    qtyG: integer('qty_g').notNull(),
    periodStart: day('period_start').notNull(),
    periodEnd: day('period_end').notNull(),
    assigneeId: uuid('assignee_id').references(() => users.id),
    status: shoppingStatus('status').notNull().default('pending'),
    isManual: boolean('is_manual').notNull().default(false),
    boughtAt: tsz('bought_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('shopping_items_group_idx').on(t.groupId, t.periodStart)],
);

export const expenses = pgTable(
  'expenses',
  {
    id: id(),
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    paidBy: uuid('paid_by').notNull().references(() => users.id),
    amount: money('amount').notNull(),
    category: expenseCategory('category').notNull().default('groceries'),
    note: text('note'),
    spentAt: tsz('spent_at').notNull().defaultNow(),
    periodStart: day('period_start'), // ulush qaysi davr porsiyalaridan hisoblanadi
    periodEnd: day('period_end'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('expenses_group_idx').on(t.groupId, t.spentAt)],
);

export const expenseShares = pgTable(
  'expense_shares',
  {
    expenseId: uuid('expense_id').notNull().references(() => expenses.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id),
    amount: money('amount').notNull(),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.userId] })],
);

export const settlements = pgTable(
  'settlements',
  {
    id: id(),
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    fromUser: uuid('from_user').notNull().references(() => users.id),
    toUser: uuid('to_user').notNull().references(() => users.id),
    amount: money('amount').notNull(),
    settledAt: tsz('settled_at').notNull().defaultNow(),
  },
  (t) => [index('settlements_group_idx').on(t.groupId)],
);

// ───────────────────────── relations (so'rovlar uchun) ─────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(userProfiles, { fields: [users.id], references: [userProfiles.userId] }),
  memberships: many(groupMembers),
}));
export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, { fields: [userProfiles.userId], references: [users.id] }),
}));
export const groupsRelations = relations(groups, ({ many }) => ({
  members: many(groupMembers),
  mealSettings: many(groupMealSettings),
}));
export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, { fields: [groupMembers.groupId], references: [groups.id] }),
  user: one(users, { fields: [groupMembers.userId], references: [users.id] }),
}));
export const groupMealSettingsRelations = relations(groupMealSettings, ({ one }) => ({
  group: one(groups, { fields: [groupMealSettings.groupId], references: [groups.id] }),
}));
export const ingredientsRelations = relations(ingredients, ({ many }) => ({
  translations: many(ingredientTranslations),
}));
export const ingredientTranslationsRelations = relations(ingredientTranslations, ({ one }) => ({
  ingredient: one(ingredients, { fields: [ingredientTranslations.ingredientId], references: [ingredients.id] }),
}));
export const dishesRelations = relations(dishes, ({ many }) => ({
  translations: many(dishTranslations),
  ingredients: many(dishIngredients),
  steps: many(dishSteps),
}));
export const dishTranslationsRelations = relations(dishTranslations, ({ one }) => ({
  dish: one(dishes, { fields: [dishTranslations.dishId], references: [dishes.id] }),
}));
export const dishIngredientsRelations = relations(dishIngredients, ({ one }) => ({
  dish: one(dishes, { fields: [dishIngredients.dishId], references: [dishes.id] }),
  ingredient: one(ingredients, { fields: [dishIngredients.ingredientId], references: [ingredients.id] }),
}));
export const dishStepsRelations = relations(dishSteps, ({ one, many }) => ({
  dish: one(dishes, { fields: [dishSteps.dishId], references: [dishes.id] }),
  translations: many(dishStepTranslations),
}));
export const dishStepTranslationsRelations = relations(dishStepTranslations, ({ one }) => ({
  step: one(dishSteps, { fields: [dishStepTranslations.stepId], references: [dishSteps.id] }),
}));
export const cookbooksRelations = relations(cookbooks, ({ many }) => ({
  translations: many(cookbookTranslations),
  meals: many(cookbookMeals),
}));
export const cookbookTranslationsRelations = relations(cookbookTranslations, ({ one }) => ({
  cookbook: one(cookbooks, { fields: [cookbookTranslations.cookbookId], references: [cookbooks.id] }),
}));
export const cookbookMealsRelations = relations(cookbookMeals, ({ one, many }) => ({
  cookbook: one(cookbooks, { fields: [cookbookMeals.cookbookId], references: [cookbooks.id] }),
  dishes: many(cookbookMealDishes),
}));
export const cookbookMealDishesRelations = relations(cookbookMealDishes, ({ one }) => ({
  meal: one(cookbookMeals, { fields: [cookbookMealDishes.cookbookMealId], references: [cookbookMeals.id] }),
  dish: one(dishes, { fields: [cookbookMealDishes.dishId], references: [dishes.id] }),
}));
export const mealInstancesRelations = relations(mealInstances, ({ many }) => ({
  dishes: many(mealInstanceDishes),
  attendance: many(attendance),
  portions: many(mealPortions),
}));
export const mealInstanceDishesRelations = relations(mealInstanceDishes, ({ one }) => ({
  meal: one(mealInstances, { fields: [mealInstanceDishes.mealInstanceId], references: [mealInstances.id] }),
  dish: one(dishes, { fields: [mealInstanceDishes.dishId], references: [dishes.id] }),
}));
export const attendanceRelations = relations(attendance, ({ one }) => ({
  meal: one(mealInstances, { fields: [attendance.mealInstanceId], references: [mealInstances.id] }),
  user: one(users, { fields: [attendance.userId], references: [users.id] }),
}));
export const mealPortionsRelations = relations(mealPortions, ({ one }) => ({
  meal: one(mealInstances, { fields: [mealPortions.mealInstanceId], references: [mealInstances.id] }),
}));
