import { pgTable, pgSchema, unique, uuid, text, jsonb, timestamp, foreignKey, pgPolicy, numeric, integer, boolean, date, index, check, uniqueIndex, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const auth = pgSchema("auth");
export const appRole = pgEnum("app_role", ['admin', 'student'])
export const cefrLevel = pgEnum("cefr_level", ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])


export const usersInAuth = auth.table("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: text().notNull(),
	encryptedPassword: text("encrypted_password"),
	rawUserMetaData: jsonb("raw_user_meta_data").default({}).notNull(),
	emailConfirmedAt: timestamp("email_confirmed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("users_email_key").on(table.email),
]);

export const pronunciationScores = pgTable("pronunciation_scores", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	sound: text().notNull(),
	score: numeric({ precision: 5, scale:  2 }).default('0').notNull(),
	attempts: integer().default(0).notNull(),
	// Step 8 ("Mastered") of the Pronunciation practice flow — consecutive
	// attempts scoring >=90, resets to 0 on a lower score. Mirrors
	// shadowing_progress.clear_attempts/status exactly (same non-sticky
	// semantics: mastered can be lost again by a later bad attempt).
	clearRuns: integer("clear_runs").default(0).notNull(),
	mastered: boolean().default(false).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "pronunciation_scores_user_id_fkey"
		}).onDelete("cascade"),
	unique("pronunciation_scores_user_id_sound_key").on(table.userId, table.sound),
	pgPolicy("admin read pronunciation_scores", { as: "permissive", for: "select", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)` }),
	pgPolicy("own rows pronunciation_scores", { as: "permissive", for: "all", to: ["authenticated"] }),
]);

export const conversationSessions = pgTable("conversation_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	topic: text().default('Free Conversation').notNull(),
	durationSeconds: integer("duration_seconds").default(0).notNull(),
	turnCount: integer("turn_count").default(0).notNull(),
	feedback: text().default('').notNull(),
	performance: numeric({ precision: 3, scale:  1 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "conversation_sessions_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("admin read conversation_sessions", { as: "permissive", for: "select", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)` }),
	pgPolicy("own rows conversation_sessions", { as: "permissive", for: "all", to: ["authenticated"] }),
]);

export const conversationMessages = pgTable("conversation_messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sessionId: uuid("session_id").notNull(),
	userId: uuid("user_id").notNull(),
	role: text().notNull(),
	content: text().default('').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [conversationSessions.id],
			name: "conversation_messages_session_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "conversation_messages_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("admin read conversation_messages", { as: "permissive", for: "select", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)` }),
	pgPolicy("own rows conversation_messages", { as: "permissive", for: "all", to: ["authenticated"] }),
]);

export const aiUsageLog = pgTable("ai_usage_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	capability: text().notNull(),
	provider: text().default('lovable').notNull(),
	model: text().default('').notNull(),
	units: integer().default(1).notNull(),
	inputTokens: integer("input_tokens").default(0).notNull(),
	outputTokens: integer("output_tokens").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "ai_usage_log_user_id_fkey"
		}).onDelete("set null"),
	pgPolicy("own usage insert", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`(user_id = auth.uid())`  }),
	pgPolicy("own usage read", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const ieltsAttempts = pgTable("ielts_attempts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	part: integer().default(1).notNull(),
	questionText: text("question_text").default('').notNull(),
	transcript: text().default('').notNull(),
	fluencyCoherence: numeric("fluency_coherence", { precision: 3, scale:  1 }),
	lexicalResource: numeric("lexical_resource", { precision: 3, scale:  1 }),
	grammaticalRange: numeric("grammatical_range", { precision: 3, scale:  1 }),
	pronunciation: numeric({ precision: 3, scale:  1 }),
	estimatedBand: numeric("estimated_band", { precision: 3, scale:  1 }),
	feedback: text().default('').notNull(),
	correctedAnswer: text("corrected_answer").default('').notNull(),
	naturalAnswer: text("natural_answer").default('').notNull(),
	band6Version: text("band6_version").default('').notNull(),
	band7Version: text("band7_version").default('').notNull(),
	band8Version: text("band8_version").default('').notNull(),
	isDemo: boolean("is_demo").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "ielts_attempts_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("admin read ielts_attempts", { as: "permissive", for: "select", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)` }),
	pgPolicy("own rows ielts_attempts", { as: "permissive", for: "all", to: ["authenticated"] }),
]);

export const vocabularyProgress = pgTable("vocabulary_progress", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	wordId: uuid("word_id").notNull(),
	timesPracticed: integer("times_practiced").default(0).notNull(),
	mastered: boolean().default(false).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "vocabulary_progress_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [vocabularyWords.id],
			name: "vocabulary_progress_word_id_fkey"
		}).onDelete("cascade"),
	unique("vocabulary_progress_user_id_word_id_key").on(table.userId, table.wordId),
	pgPolicy("admin read vocabulary_progress", { as: "permissive", for: "select", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)` }),
	pgPolicy("own rows vocabulary_progress", { as: "permissive", for: "all", to: ["authenticated"] }),
]);

export const listeningAttempts = pgTable("listening_attempts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	exerciseId: uuid("exercise_id"),
	score: numeric({ precision: 5, scale:  2 }).default('0').notNull(),
	answers: jsonb().default([]).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "listening_attempts_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.exerciseId],
			foreignColumns: [listeningExercises.id],
			name: "listening_attempts_exercise_id_fkey"
		}).onDelete("set null"),
	pgPolicy("admin read listening_attempts", { as: "permissive", for: "select", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)` }),
	pgPolicy("own rows listening_attempts", { as: "permissive", for: "all", to: ["authenticated"] }),
]);

export const dailyPlans = pgTable("daily_plans", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	planDate: date("plan_date").default(sql`CURRENT_DATE`).notNull(),
	tasks: jsonb().default([]).notNull(),
	insights: jsonb().default([]).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "daily_plans_user_id_fkey"
		}).onDelete("cascade"),
	unique("daily_plans_user_id_plan_date_key").on(table.userId, table.planDate),
	pgPolicy("admin read daily_plans", { as: "permissive", for: "select", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)` }),
	pgPolicy("own rows daily_plans", { as: "permissive", for: "all", to: ["authenticated"] }),
]);

export const ttsCache = pgTable("tts_cache", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	cacheKey: text("cache_key").notNull(),
	textContent: text("text_content").notNull(),
	voice: text().default('default').notNull(),
	audioBase64: text("audio_base64").notNull(),
	mimeType: text("mime_type").default('audio/mpeg').notNull(),
	hits: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("tts_cache_cache_key_key").on(table.cacheKey),
	pgPolicy("cache readable", { as: "permissive", for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const uiTranslations = pgTable("ui_translations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	locale: text().notNull(),
	translationKey: text("translation_key").notNull(),
	value: text().notNull(),
	updatedBy: uuid("updated_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ui_translations_locale_idx").using("btree", table.locale.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.locale],
			foreignColumns: [uiLanguages.code],
			name: "ui_translations_locale_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [usersInAuth.id],
			name: "ui_translations_updated_by_fkey"
		}).onDelete("set null"),
	unique("ui_translations_locale_translation_key_key").on(table.locale, table.translationKey),
	pgPolicy("admin write ui_translations", { as: "permissive", for: "all", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)`, withCheck: sql`has_role(auth.uid(), 'admin'::app_role)`  }),
	pgPolicy("public read ui_translations", { as: "permissive", for: "select", to: ["anon", "authenticated"] }),
]);

export const uiLanguages = pgTable("ui_languages", {
	code: text().primaryKey().notNull(),
	nativeName: text("native_name").notNull(),
	englishName: text("english_name").notNull(),
	flag: text().default('').notNull(),
	direction: text().default('ltr').notNull(),
	intlTag: text("intl_tag").default('en-US').notNull(),
	enabled: boolean().default(true).notNull(),
	isDefault: boolean("is_default").default(false).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	pgPolicy("admin write ui_languages", { as: "permissive", for: "all", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)`, withCheck: sql`has_role(auth.uid(), 'admin'::app_role)`  }),
	pgPolicy("public read ui_languages", { as: "permissive", for: "select", to: ["anon", "authenticated"] }),
]);

export const userRoles = pgTable("user_roles", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	role: appRole().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "user_roles_user_id_fkey"
		}).onDelete("cascade"),
	unique("user_roles_user_id_role_key").on(table.userId, table.role),
	pgPolicy("admins manage roles", { as: "permissive", for: "all", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)`, withCheck: sql`has_role(auth.uid(), 'admin'::app_role)`  }),
	pgPolicy("own roles read", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const vocabularyWords = pgTable("vocabulary_words", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	word: text().notNull(),
	ipa: text().default('').notNull(),
	meaningVi: text("meaning_vi").default('').notNull(),
	meaningEn: text("meaning_en").default('').notNull(),
	category: text().default('Daily English').notNull(),
	level: cefrLevel().default('B1').notNull(),
	exampleSentence: text("example_sentence").default('').notNull(),
	exampleVi: text("example_vi").default('').notNull(),
	usageContext: text("usage_context").default('').notNull(),
	synonyms: text().array().default([""]).notNull(),
	antonyms: text().array().default([""]).notNull(),
	status: text().default('published').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	accessTier: text("access_tier").default('free').notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
}, (table) => [
	pgPolicy("read entitled vocabulary_words", { as: "permissive", for: "select", to: ["anon", "authenticated"], using: sql`(((status = 'published'::text) AND can_access_tier(access_tier)) OR has_role(auth.uid(), 'admin'::app_role))` }),
	pgPolicy("admin write vocabulary_words", { as: "permissive", for: "all", to: ["authenticated"] }),
	check("vocabulary_words_access_tier_check", sql`access_tier = ANY (ARRAY['free'::text, 'premium'::text, 'ielts_pro'::text])`),
	unique("vocabulary_words_category_sort_order_key").on(table.category, table.sortOrder),
]);

export const grammarLessons = pgTable("grammar_lessons", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	slug: text().notNull(),
	title: text().notNull(),
	level: cefrLevel().default('B1').notNull(),
	summary: text().default('').notNull(),
	explanation: text().default('').notNull(),
	explanationVi: text("explanation_vi").default('').notNull(),
	examples: jsonb().default([]).notNull(),
	exercises: jsonb().default([]).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	status: text().default('published').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	accessTier: text("access_tier").default('free').notNull(),
}, (table) => [
	unique("grammar_lessons_slug_key").on(table.slug),
	pgPolicy("read entitled grammar_lessons", { as: "permissive", for: "select", to: ["anon", "authenticated"], using: sql`(((status = 'published'::text) AND can_access_tier(access_tier)) OR has_role(auth.uid(), 'admin'::app_role))` }),
	pgPolicy("admin write grammar_lessons", { as: "permissive", for: "all", to: ["authenticated"] }),
	check("grammar_lessons_access_tier_check", sql`access_tier = ANY (ARRAY['free'::text, 'premium'::text, 'ielts_pro'::text])`),
]);

export const speakingQuestions = pgTable("speaking_questions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	prompt: text().notNull(),
	category: text().default('Daily Life').notNull(),
	level: cefrLevel().default('B1').notNull(),
	part: text().default('general').notNull(),
	status: text().default('published').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	pgPolicy("admin write speaking_questions", { as: "permissive", for: "all", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)`, withCheck: sql`has_role(auth.uid(), 'admin'::app_role)`  }),
	pgPolicy("public read speaking_questions", { as: "permissive", for: "select", to: ["anon", "authenticated"] }),
]);

export const listeningExercises = pgTable("listening_exercises", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	level: cefrLevel().default('A2').notNull(),
	activityType: text("activity_type").default('listen_and_choose').notNull(),
	transcript: text().default('').notNull(),
	questions: jsonb().default([]).notNull(),
	status: text().default('published').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	accessTier: text("access_tier").default('free').notNull(),
}, (table) => [
	pgPolicy("read entitled listening_exercises", { as: "permissive", for: "select", to: ["anon", "authenticated"], using: sql`(((status = 'published'::text) AND can_access_tier(access_tier)) OR has_role(auth.uid(), 'admin'::app_role))` }),
	pgPolicy("admin write listening_exercises", { as: "permissive", for: "all", to: ["authenticated"] }),
	check("listening_exercises_access_tier_check", sql`access_tier = ANY (ARRAY['free'::text, 'premium'::text, 'ielts_pro'::text])`),
]);

export const ieltsQuestions = pgTable("ielts_questions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	part: integer().default(1).notNull(),
	topic: text().default('General').notNull(),
	prompt: text().notNull(),
	cuePoints: text("cue_points").array().default([""]).notNull(),
	status: text().default('published').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	accessTier: text("access_tier").default('ielts_pro').notNull(),
}, (table) => [
	pgPolicy("read entitled ielts_questions", { as: "permissive", for: "select", to: ["anon", "authenticated"], using: sql`(((status = 'published'::text) AND can_access_tier(access_tier)) OR has_role(auth.uid(), 'admin'::app_role))` }),
	pgPolicy("admin write ielts_questions", { as: "permissive", for: "all", to: ["authenticated"] }),
	check("ielts_questions_access_tier_check", sql`access_tier = ANY (ARRAY['free'::text, 'premium'::text, 'ielts_pro'::text])`),
]);

export const speakingAttempts = pgTable("speaking_attempts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	questionId: uuid("question_id"),
	questionText: text("question_text").default('').notNull(),
	transcript: text().default('').notNull(),
	fluency: numeric({ precision: 3, scale:  1 }),
	grammar: numeric({ precision: 3, scale:  1 }),
	vocabulary: numeric({ precision: 3, scale:  1 }),
	pronunciation: numeric({ precision: 3, scale:  1 }),
	overall: numeric({ precision: 3, scale:  1 }),
	mistakes: jsonb().default([]).notNull(),
	corrections: jsonb().default([]).notNull(),
	betterVocabulary: jsonb("better_vocabulary").default([]).notNull(),
	naturalAnswer: text("natural_answer").default('').notNull(),
	feedback: text().default('').notNull(),
	audioPath: text("audio_path"),
	isDemo: boolean("is_demo").default(false).notNull(),
	durationSeconds: integer("duration_seconds").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "speaking_attempts_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.questionId],
			foreignColumns: [speakingQuestions.id],
			name: "speaking_attempts_question_id_fkey"
		}).onDelete("set null"),
	pgPolicy("admin read speaking_attempts", { as: "permissive", for: "select", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)` }),
	pgPolicy("own rows speaking_attempts", { as: "permissive", for: "all", to: ["authenticated"] }),
]);

export const pronunciationAttempts = pgTable("pronunciation_attempts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	mode: text().default('sound').notNull(),
	target: text().default('').notNull(),
	targetSound: text("target_sound"),
	transcript: text().default('').notNull(),
	accuracy: numeric({ precision: 5, scale:  2 }),
	feedback: text().default('').notNull(),
	feedbackVi: text("feedback_vi").default('').notNull(),
	audioPath: text("audio_path"),
	isDemo: boolean("is_demo").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "pronunciation_attempts_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("admin read pronunciation_attempts", { as: "permissive", for: "select", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)` }),
	pgPolicy("own rows pronunciation_attempts", { as: "permissive", for: "all", to: ["authenticated"] }),
]);

export const vocabularyTranslations = pgTable("vocabulary_translations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	wordId: uuid("word_id").notNull(),
	locale: text().notNull(),
	meaning: text().default('').notNull(),
	exampleTranslation: text("example_translation").default('').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.wordId],
			foreignColumns: [vocabularyWords.id],
			name: "vocabulary_translations_word_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.locale],
			foreignColumns: [uiLanguages.code],
			name: "vocabulary_translations_locale_fkey"
		}).onDelete("cascade"),
	unique("vocabulary_translations_word_id_locale_key").on(table.wordId, table.locale),
	pgPolicy("admin write vocabulary_translations", { as: "permissive", for: "all", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)`, withCheck: sql`has_role(auth.uid(), 'admin'::app_role)`  }),
	pgPolicy("public read vocabulary_translations", { as: "permissive", for: "select", to: ["anon", "authenticated"] }),
]);

export const subscriptions = pgTable("subscriptions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	paddleSubscriptionId: text("paddle_subscription_id").notNull(),
	paddleCustomerId: text("paddle_customer_id").notNull(),
	productId: text("product_id").notNull(),
	priceId: text("price_id").notNull(),
	status: text().default('active').notNull(),
	billingInterval: text("billing_interval").default('month').notNull(),
	currency: text().default('USD').notNull(),
	amount: integer(),
	currentPeriodStart: timestamp("current_period_start", { withTimezone: true, mode: 'string' }),
	currentPeriodEnd: timestamp("current_period_end", { withTimezone: true, mode: 'string' }),
	cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
	scheduledChange: text("scheduled_change").default('').notNull(),
	trialEndsAt: timestamp("trial_ends_at", { withTimezone: true, mode: 'string' }),
	environment: text().default('sandbox').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_subscriptions_paddle_id").using("btree", table.paddleSubscriptionId.asc().nullsLast().op("text_ops")),
	index("idx_subscriptions_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "subscriptions_user_id_fkey"
		}).onDelete("cascade"),
	unique("subscriptions_paddle_subscription_id_key").on(table.paddleSubscriptionId),
	pgPolicy("Users read own subscription", { as: "permissive", for: "select", to: ["authenticated"], using: sql`((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role))` }),
]);

export const grammarTranslations = pgTable("grammar_translations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	lessonId: uuid("lesson_id").notNull(),
	locale: text().notNull(),
	explanation: text().default('').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.lessonId],
			foreignColumns: [grammarLessons.id],
			name: "grammar_translations_lesson_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.locale],
			foreignColumns: [uiLanguages.code],
			name: "grammar_translations_locale_fkey"
		}).onDelete("cascade"),
	unique("grammar_translations_lesson_id_locale_key").on(table.lessonId, table.locale),
	pgPolicy("admin write grammar_translations", { as: "permissive", for: "all", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)`, withCheck: sql`has_role(auth.uid(), 'admin'::app_role)`  }),
	pgPolicy("public read grammar_translations", { as: "permissive", for: "select", to: ["anon", "authenticated"] }),
]);

export const billingPlans = pgTable("billing_plans", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	planKey: text("plan_key").notNull(),
	tier: text().notNull(),
	name: text().notNull(),
	tagline: text().default('').notNull(),
	badge: text().default('').notNull(),
	monthlyPriceId: text("monthly_price_id").default('').notNull(),
	yearlyPriceId: text("yearly_price_id").default('').notNull(),
	monthlyAmount: integer("monthly_amount").default(0).notNull(),
	yearlyAmount: integer("yearly_amount").default(0).notNull(),
	currency: text().default('USD').notNull(),
	features: jsonb().default([]).notNull(),
	limits: jsonb().default({}).notNull(),
	trialEnabled: boolean("trial_enabled").default(false).notNull(),
	trialDays: integer("trial_days").default(7).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("billing_plans_plan_key_key").on(table.planKey),
	unique("billing_plans_tier_key").on(table.tier),
	pgPolicy("Admins manage plans", { as: "permissive", for: "all", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)`, withCheck: sql`has_role(auth.uid(), 'admin'::app_role)`  }),
	pgPolicy("Anyone can read active plans", { as: "permissive", for: "select", to: ["public"] }),
]);

export const billingEvents = pgTable("billing_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	event: text().notNull(),
	planKey: text("plan_key").default('').notNull(),
	intervalKey: text("interval_key").default('').notNull(),
	environment: text().default('sandbox').notNull(),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_billing_events_event").using("btree", table.event.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "billing_events_user_id_fkey"
		}).onDelete("set null"),
	pgPolicy("Admins read billing events", { as: "permissive", for: "select", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)` }),
]);

export const usageCounters = pgTable("usage_counters", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	capability: text().notNull(),
	periodStart: date("period_start").notNull(),
	units: integer().default(0).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_usage_counters_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.periodStart.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "usage_counters_user_id_fkey"
		}).onDelete("cascade"),
	unique("usage_counters_user_id_capability_period_start_key").on(table.userId, table.capability, table.periodStart),
	pgPolicy("Users read own usage", { as: "permissive", for: "select", to: ["authenticated"], using: sql`((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role))` }),
]);

export const complimentaryAccess = pgTable("complimentary_access", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	tier: text().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	note: text().default('').notNull(),
	grantedBy: uuid("granted_by"),
	revoked: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_comp_access_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "complimentary_access_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.grantedBy],
			foreignColumns: [usersInAuth.id],
			name: "complimentary_access_granted_by_fkey"
		}).onDelete("set null"),
	pgPolicy("Admins manage complimentary access", { as: "permissive", for: "all", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)`, withCheck: sql`has_role(auth.uid(), 'admin'::app_role)`  }),
	pgPolicy("Users read own complimentary access", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const adminAuditLog = pgTable("admin_audit_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	actorId: uuid("actor_id"),
	targetUserId: uuid("target_user_id"),
	action: text().notNull(),
	details: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_admin_audit_created").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.actorId],
			foreignColumns: [usersInAuth.id],
			name: "admin_audit_log_actor_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.targetUserId],
			foreignColumns: [usersInAuth.id],
			name: "admin_audit_log_target_user_id_fkey"
		}).onDelete("set null"),
	pgPolicy("Admins read audit log", { as: "permissive", for: "select", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)` }),
]);

export const aiSpeakingMemory = pgTable("ai_speaking_memory", {
	userId: uuid("user_id").primaryKey().notNull(),
	level: text().default('B1').notNull(),
	weakPoints: jsonb("weak_points").default([]).notNull(),
	focusTopics: jsonb("focus_topics").default([]).notNull(),
	vocabularyToReview: jsonb("vocabulary_to_review").default([]).notNull(),
	summary: text().default('').notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "ai_speaking_memory_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("own memory manageable", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`(user_id = auth.uid())`  }),
]);

export const profiles = pgTable("profiles", {
	id: uuid().primaryKey().notNull(),
	fullName: text("full_name").default('').notNull(),
	email: text().default('').notNull(),
	englishLevel: cefrLevel("english_level").default('B1').notNull(),
	targetLevel: cefrLevel("target_level").default('C1').notNull(),
	learningGoal: text("learning_goal").default('').notNull(),
	uiLanguage: text("ui_language").default('en').notNull(),
	streakDays: integer("streak_days").default(0).notNull(),
	lastPracticeOn: date("last_practice_on"),
	practiceMinutes: integer("practice_minutes").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	interfaceLanguage: text("interface_language").default('en').notNull(),
	nativeLanguage: text("native_language").default('').notNull(),
	dailyGoalMinutes: integer("daily_goal_minutes").default(10).notNull(),
	englishOnlyMode: boolean("english_only_mode").default(false).notNull(),
	accentPreference: text("accent_preference").default('us').notNull(),
	voicePreference: text("voice_preference").default('shimmer').notNull(),
	timezone: text().default('UTC').notNull(),
	onboardedAt: timestamp("onboarded_at", { withTimezone: true, mode: 'string' }),
	firstName: text("first_name").default('').notNull(),
	lastName: text("last_name").default('').notNull(),
	country: text().default('').notNull(),
	ageRange: text("age_range").default('').notNull(),
	termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true, mode: 'string' }),
	privacyAcceptedAt: timestamp("privacy_accepted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.id],
			foreignColumns: [usersInAuth.id],
			name: "profiles_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("own profile update", { as: "permissive", for: "update", to: ["authenticated"], using: sql`(id = auth.uid())`, withCheck: sql`(id = auth.uid())`  }),
	pgPolicy("own profile insert", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("own profile read", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const shadowingTopics = pgTable("shadowing_topics", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	slug: text().notNull(),
	name: text().notNull(),
	topicGroup: text("topic_group").default('Everyday English').notNull(),
	blurb: text().default('').notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("shadowing_topics_slug_key").on(table.slug),
	pgPolicy("shadowing_topics_admin_write", { as: "permissive", for: "all", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)`, withCheck: sql`has_role(auth.uid(), 'admin'::app_role)`  }),
	pgPolicy("shadowing_topics_read", { as: "permissive", for: "select", to: ["public"] }),
]);

export const aiSpeakingSessions = pgTable("ai_speaking_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	topic: text().default('free_conversation').notNull(),
	level: text().default('B1').notNull(),
	status: text().default('active').notNull(),
	avatarProvider: text("avatar_provider").default('none').notNull(),
	voiceProvider: text("voice_provider").default('openai_realtime').notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	endedAt: timestamp("ended_at", { withTimezone: true, mode: 'string' }),
	lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	countedSeconds: integer("counted_seconds").default(0).notNull(),
	minutesAllowed: integer("minutes_allowed").default(0).notNull(),
	overallScore: integer("overall_score"),
	grammarScore: integer("grammar_score"),
	vocabularyScore: integer("vocabulary_score"),
	pronunciationScore: integer("pronunciation_score"),
	fluencyScore: integer("fluency_score"),
	transcript: jsonb().default([]).notNull(),
	report: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_speaking_sessions_active_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")).where(sql`(status = 'active'::text)`),
	index("ai_speaking_sessions_user_idx").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "ai_speaking_sessions_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("own sessions updatable", { as: "permissive", for: "update", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`(user_id = auth.uid())`  }),
	pgPolicy("own sessions insertable", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("own sessions readable", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const aiSpeakingSettings = pgTable("ai_speaking_settings", {
	id: text().default('default').primaryKey().notNull(),
	avatarId: text("avatar_id").default('Ann_Therapist_public').notNull(),
	avatarQuality: text("avatar_quality").default('high').notNull(),
	voiceId: text("voice_id").default('').notNull(),
	fallbackVoice: text("fallback_voice").default('shimmer').notNull(),
	speechRate: numeric("speech_rate").default('1.0').notNull(),
	correctionFrequency: text("correction_frequency").default('balanced').notNull(),
	maxSessionMinutes: integer("max_session_minutes").default(15).notNull(),
	freeMinutes: integer("free_minutes").default(15).notNull(),
	premiumMinutes: integer("premium_minutes").default(60).notNull(),
	proMinutes: integer("pro_minutes").default(200).notNull(),
	topics: jsonb().default([]).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	pgPolicy("settings admin writable", { as: "permissive", for: "all", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)`, withCheck: sql`has_role(auth.uid(), 'admin'::app_role)`  }),
	pgPolicy("settings readable", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const aiSpeakingMistakes = pgTable("ai_speaking_mistakes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	sessionId: uuid("session_id"),
	category: text().default('grammar').notNull(),
	said: text().notNull(),
	correction: text().notNull(),
	note: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_speaking_mistakes_user_idx").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "ai_speaking_mistakes_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [aiSpeakingSessions.id],
			name: "ai_speaking_mistakes_session_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("own mistakes insertable", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`(user_id = auth.uid())`  }),
	pgPolicy("own mistakes readable", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const shadowingSentences = pgTable("shadowing_sentences", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	topicId: uuid("topic_id").notNull(),
	subcategory: text().default('').notNull(),
	level: text().default('beginner').notNull(),
	difficulty: integer().default(1).notNull(),
	sentenceType: text("sentence_type").default('statement').notNull(),
	sentence: text().notNull(),
	naturalForm: text("natural_form").default('').notNull(),
	translation: text().default('').notNull(),
	audioUrl: text("audio_url").default('').notNull(),
	accent: text().default('american').notNull(),
	pronunciationFocus: text("pronunciation_focus").default('').notNull(),
	stressFocus: text("stress_focus").default('').notNull(),
	intonationFocus: text("intonation_focus").default('').notNull(),
	connectedSpeechFocus: text("connected_speech_focus").default('').notNull(),
	vocabulary: jsonb().default([]).notNull(),
	grammarFocus: text("grammar_focus").default('').notNull(),
	tags: text().array().default([""]).notNull(),
	isFree: boolean("is_free").default(false).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	status: text().default('published').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	/** Groups several rows into one multi-turn dialogue; null = a standalone
	 * sentence, unchanged from before this column existed. */
	dialogueId: uuid("dialogue_id"),
	/** 1-based order of this line within its dialogue (unset/0 for standalone
	 * sentences — sortOrder still governs practice order either way). */
	turnNumber: integer("turn_number").default(0).notNull(),
	/** Free-text speaker name for this line, e.g. "Waiter" — same
	 * free-text-no-enum convention as coach_topics.ai_role/user_role. */
	speakerLabel: text("speaker_label").default('').notNull(),
	/** One of LILY_VOICES (shimmer/nova/alloy/coral/sage) — lets each speaker
	 * in a dialogue sound like a different person. */
	speakerVoice: text("speaker_voice").default('').notNull(),
}, (table) => [
	index("idx_shadowing_sentences_level").using("btree", table.level.asc().nullsLast().op("text_ops")),
	index("idx_shadowing_sentences_topic").using("btree", table.topicId.asc().nullsLast().op("uuid_ops"), table.sortOrder.asc().nullsLast().op("int4_ops")),
	index("idx_shadowing_sentences_dialogue").using("btree", table.dialogueId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.topicId],
			foreignColumns: [shadowingTopics.id],
			name: "shadowing_sentences_topic_id_fkey"
		}).onDelete("cascade"),
	unique("shadowing_sentences_unique_order").on(table.topicId, table.sortOrder),
	pgPolicy("shadowing_sentences_admin", { as: "permissive", for: "all", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)`, withCheck: sql`has_role(auth.uid(), 'admin'::app_role)`  }),
	pgPolicy("shadowing_sentences_read_premium", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("shadowing_sentences_read_free", { as: "permissive", for: "select", to: ["public"] }),
	check("shadowing_sentences_level_check", sql`level = ANY (ARRAY['beginner'::text, 'elementary'::text, 'intermediate'::text, 'advanced'::text])`),
	check("shadowing_sentences_accent_check", sql`accent = ANY (ARRAY['american'::text, 'british'::text])`),
]);

/** Content table for the 8 Pronunciation advanced-skill tabs (word stress,
 * sentence stress, intonation, connected speech, reductions, rhythm,
 * chunking, fluency) — previously a hardcoded SKILL_LESSONS array in
 * pronunciation-content.ts with no admin management and no server-side
 * gating. Mirrors shadowing_sentences' column conventions (is_free/
 * sort_order/status triplet, text[] for a short tag-like list, jsonb for a
 * richer nested list) so the same admin CRUD pattern applies unchanged. */
export const pronunciationLessons = pgTable("pronunciation_lessons", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	skill: text().notNull(),
	title: text().notNull(),
	level: text().default('beginner').notNull(),
	difficulty: text().default('easy').notNull(),
	accent: text().default('us').notNull(),
	explain: text().default('').notNull(),
	points: text().array().default([]).notNull(),
	/** SkillItem[]: { text, pattern?, note? } — what the learner says, the
	 * visual stress/pause/pitch pattern, an optional note. */
	items: jsonb().default([]).notNull(),
	caution: text().default('').notNull(),
	isFree: boolean("is_free").default(false).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	status: text().default('published').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_pronunciation_lessons_skill").using("btree", table.skill.asc().nullsLast().op("text_ops"), table.sortOrder.asc().nullsLast().op("int4_ops")),
	unique("pronunciation_lessons_unique_order").on(table.skill, table.sortOrder),
	pgPolicy("pronunciation_lessons_admin", { as: "permissive", for: "all", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)`, withCheck: sql`has_role(auth.uid(), 'admin'::app_role)`  }),
	pgPolicy("pronunciation_lessons_read_premium", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("pronunciation_lessons_read_free", { as: "permissive", for: "select", to: ["public"] }),
	check("pronunciation_lessons_skill_check", sql`skill = ANY (ARRAY['word-stress'::text, 'sentence-stress'::text, 'intonation'::text, 'connected-speech'::text, 'reductions'::text, 'rhythm'::text, 'chunking'::text, 'fluency'::text])`),
	check("pronunciation_lessons_level_check", sql`level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text])`),
	check("pronunciation_lessons_difficulty_check", sql`difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text])`),
	check("pronunciation_lessons_accent_check", sql`accent = ANY (ARRAY['us'::text, 'uk'::text])`),
]);

export const shadowingProgress = pgTable("shadowing_progress", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	sentenceId: uuid("sentence_id").notNull(),
	attempts: integer().default(0).notNull(),
	clearAttempts: integer("clear_attempts").default(0).notNull(),
	bestAccuracy: numeric("best_accuracy"),
	lastAccuracy: numeric("last_accuracy"),
	status: text().default('in_progress').notNull(),
	secondsPractised: integer("seconds_practised").default(0).notNull(),
	lastPractisedAt: timestamp("last_practised_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_shadowing_progress_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.lastPractisedAt.desc().nullsFirst().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "shadowing_progress_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.sentenceId],
			foreignColumns: [shadowingSentences.id],
			name: "shadowing_progress_sentence_id_fkey"
		}).onDelete("cascade"),
	unique("shadowing_progress_unique").on(table.userId, table.sentenceId),
	pgPolicy("shadowing_progress_own", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(auth.uid() = user_id)`, withCheck: sql`(auth.uid() = user_id)`  }),
	check("shadowing_progress_status_check", sql`status = ANY (ARRAY['in_progress'::text, 'needs_practice'::text, 'strong'::text, 'mastered'::text])`),
]);

export const coachSettings = pgTable("coach_settings", {
	id: text().default('default').primaryKey().notNull(),
	freeTurnLimit: integer("free_turn_limit").default(4).notNull(),
	premiumMonthlyTurns: integer("premium_monthly_turns").default(0).notNull(),
	proMonthlyTurns: integer("pro_monthly_turns").default(0).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	pgPolicy("Admins manage coach settings", { as: "permissive", for: "all", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)`, withCheck: sql`has_role(auth.uid(), 'admin'::app_role)`  }),
	pgPolicy("Signed-in learners read coach settings", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const coachTopics = pgTable("coach_topics", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	category: text().notNull(),
	slug: text().notNull(),
	title: text().notNull(),
	description: text().default('').notNull(),
	level: text().default('B1').notNull(),
	accessTier: text("access_tier").default('free').notNull(),
	aiRole: text("ai_role").default('').notNull(),
	userRole: text("user_role").default('').notNull(),
	situation: text().default('').notNull(),
	objective: text().default('').notNull(),
	openingMessage: text("opening_message").default('').notNull(),
	instructions: text().default('').notNull(),
	followUpDirections: text("follow_up_directions").array().default([""]).notNull(),
	vocabularyFocus: text("vocabulary_focus").default('').notNull(),
	grammarFocus: text("grammar_focus").default('').notNull(),
	interviewType: text("interview_type").default('').notNull(),
	challengePrompt: text("challenge_prompt").default('').notNull(),
	evaluationCriteria: text("evaluation_criteria").default('').notNull(),
	timeLimitSeconds: integer("time_limit_seconds").default(0).notNull(),
	estimatedMinutes: integer("estimated_minutes").default(5).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("coach_topics_category_idx").using("btree", table.category.asc().nullsLast().op("int4_ops"), table.sortOrder.asc().nullsLast().op("int4_ops")),
	unique("coach_topics_slug_key").on(table.slug),
	pgPolicy("Admins manage coach topics", { as: "permissive", for: "all", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)`, withCheck: sql`has_role(auth.uid(), 'admin'::app_role)`  }),
	pgPolicy("Anyone can browse active coach topics", { as: "permissive", for: "select", to: ["public"] }),
	check("coach_topics_category_check", sql`category = ANY (ARRAY['free'::text, 'daily'::text, 'roleplay'::text, 'interview'::text, 'challenge'::text])`),
	check("coach_topics_level_check", sql`level = ANY (ARRAY['A1'::text, 'A2'::text, 'B1'::text, 'B2'::text, 'C1'::text])`),
	check("coach_topics_access_tier_check", sql`access_tier = ANY (ARRAY['free'::text, 'premium'::text, 'ielts_pro'::text])`),
]);

export const coachSessions = pgTable("coach_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	topicId: uuid("topic_id"),
	category: text().notNull(),
	topicTitle: text("topic_title").default('').notNull(),
	level: text().default('B1').notNull(),
	tierAtStart: text("tier_at_start").default('free').notNull(),
	userTurns: integer("user_turns").default(0).notNull(),
	status: text().default('active').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("coach_sessions_user_idx").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "coach_sessions_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.topicId],
			foreignColumns: [coachTopics.id],
			name: "coach_sessions_topic_id_fkey"
		}).onDelete("set null"),
	pgPolicy("Learners read own coach sessions", { as: "permissive", for: "select", to: ["authenticated"], using: sql`((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role))` }),
]);

export const coachTurns = pgTable("coach_turns", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sessionId: uuid("session_id").notNull(),
	userId: uuid("user_id").notNull(),
	turnNumber: integer("turn_number").default(0).notNull(),
	userText: text("user_text").default('').notNull(),
	coachText: text("coach_text").default('').notNull(),
	countedFree: boolean("counted_free").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	/** Full SpeakingAnalysis JSON (fluency/grammar/vocabulary/overall/mistakes/
	 * corrections/better_vocabulary/natural_answer/feedback) for this turn's
	 * user answer, so reloading the page can restore the scoring panel, not
	 * just the transcript. Null for turn 0 (opening line) and for any turn
	 * where analysis failed/was never computed. */
	analysis: jsonb(),
}, (table) => [
	index("coach_turns_session_idx").using("btree", table.sessionId.asc().nullsLast().op("int4_ops"), table.turnNumber.asc().nullsLast().op("int4_ops")),
	uniqueIndex("coach_turns_session_turn_uq").using("btree", table.sessionId.asc().nullsLast().op("int4_ops"), table.turnNumber.asc().nullsLast().op("int4_ops")),
	index("coach_turns_user_free_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.countedFree.asc().nullsLast().op("bool_ops")),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [coachSessions.id],
			name: "coach_turns_session_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "coach_turns_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Learners read own coach turns", { as: "permissive", for: "select", to: ["authenticated"], using: sql`((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role))` }),
]);

export const listeningLessons = pgTable("listening_lessons", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	slug: text().notNull(),
	title: text().notNull(),
	level: text().default('A1').notNull(),
	category: text().default('Everyday Life').notNull(),
	topic: text().default('').notNull(),
	difficulty: integer().default(1).notNull(),
	durationSeconds: integer("duration_seconds").default(30).notNull(),
	accent: text().default('american').notNull(),
	script: jsonb().default([]).notNull(),
	questions: jsonb().default([]).notNull(),
	dictation: jsonb().default([]).notNull(),
	connectedSpeech: jsonb("connected_speech").default([]).notNull(),
	isFree: boolean("is_free").default(false).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	status: text().default('published').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("listening_lessons_category_idx").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("listening_lessons_level_idx").using("btree", table.level.asc().nullsLast().op("int4_ops"), table.sortOrder.asc().nullsLast().op("int4_ops")),
	unique("listening_lessons_slug_key").on(table.slug),
	pgPolicy("Admins manage listening lessons", { as: "permissive", for: "all", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)`, withCheck: sql`has_role(auth.uid(), 'admin'::app_role)`  }),
	pgPolicy("Published listening lessons readable when unlocked", { as: "permissive", for: "select", to: ["public"] }),
]);

export const listeningProgress = pgTable("listening_progress", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	lessonId: uuid("lesson_id").notNull(),
	comprehensionScore: integer("comprehension_score"),
	dictationScore: integer("dictation_score"),
	overallScore: integer("overall_score"),
	attempts: integer().default(0).notNull(),
	secondsListened: integer("seconds_listened").default(0).notNull(),
	weakAreas: jsonb("weak_areas").default([]).notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "listening_progress_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.lessonId],
			foreignColumns: [listeningLessons.id],
			name: "listening_progress_lesson_id_fkey"
		}).onDelete("cascade"),
	unique("listening_progress_user_id_lesson_id_key").on(table.userId, table.lessonId),
	pgPolicy("Learners manage their own listening progress", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(auth.uid() = user_id)`, withCheck: sql`(auth.uid() = user_id)`  }),
]);

export const sessionsInAuth = auth.table("sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	userAgent: text("user_agent").default('').notNull(),
	ip: text().default('').notNull(),
}, (table) => [
	index("sessions_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "sessions_user_id_fkey"
		}).onDelete("cascade"),
]);

export const oauthAccountsInAuth = auth.table("oauth_accounts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	provider: text().notNull(),
	providerAccountId: text("provider_account_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("oauth_accounts_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "oauth_accounts_user_id_fkey"
		}).onDelete("cascade"),
	unique("oauth_accounts_provider_provider_account_id_key").on(table.provider, table.providerAccountId),
]);

export const speakingTestProgress = pgTable("speaking_test_progress", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	testId: uuid("test_id").notNull(),
	attempts: integer().default(0).notNull(),
	lastBand: numeric("last_band"),
	bestBand: numeric("best_band"),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("speaking_test_progress_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "speaking_test_progress_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.testId],
			foreignColumns: [speakingTests.id],
			name: "speaking_test_progress_test_id_fkey"
		}).onDelete("cascade"),
	unique("speaking_test_progress_user_id_test_id_key").on(table.userId, table.testId),
	pgPolicy("Learners manage their own speaking test progress", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(auth.uid() = user_id)`, withCheck: sql`(auth.uid() = user_id)`  }),
]);

export const passwordResetTokensInAuth = auth.table("password_reset_tokens", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	tokenHash: text("token_hash").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	usedAt: timestamp("used_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "password_reset_tokens_user_id_fkey"
		}).onDelete("cascade"),
	unique("password_reset_tokens_token_hash_key").on(table.tokenHash),
]);

export const speakingTests = pgTable("speaking_tests", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	exam: text().default('ielts').notNull(),
	part: integer().notNull(),
	slug: text().notNull(),
	topic: text().notNull(),
	difficulty: text().default('Intermediate').notNull(),
	questions: jsonb().default([]).notNull(),
	cueCard: text("cue_card").default('').notNull(),
	cuePoints: text("cue_points").array().default([""]).notNull(),
	preparationTime: integer("preparation_time").default(0).notNull(),
	speakingTime: integer("speaking_time").default(300).notNull(),
	testNumber: integer("test_number").default(0).notNull(),
	isFree: boolean("is_free").default(false).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	status: text().default('published').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	taskType: text("task_type").default('').notNull(),
	taskLabel: text("task_label").default('').notNull(),
	instructions: text().default('').notNull(),
}, (table) => [
	index("speaking_tests_number_idx").using("btree", table.testNumber.asc().nullsLast().op("int4_ops")),
	index("speaking_tests_part_idx").using("btree", table.part.asc().nullsLast().op("int4_ops"), table.sortOrder.asc().nullsLast().op("int4_ops")),
	unique("speaking_tests_slug_key").on(table.slug),
	pgPolicy("Admins manage speaking tests", { as: "permissive", for: "all", to: ["authenticated"], using: sql`has_role(auth.uid(), 'admin'::app_role)`, withCheck: sql`has_role(auth.uid(), 'admin'::app_role)`  }),
	pgPolicy("Published speaking tests are readable", { as: "permissive", for: "select", to: ["public"] }),
]);

export const emailVerificationTokensInAuth = auth.table("email_verification_tokens", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	tokenHash: text("token_hash").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	usedAt: timestamp("used_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "email_verification_tokens_user_id_fkey"
		}).onDelete("cascade"),
	unique("email_verification_tokens_token_hash_key").on(table.tokenHash),
]);
