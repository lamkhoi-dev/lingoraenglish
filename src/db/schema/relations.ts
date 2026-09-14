import { relations } from "drizzle-orm/relations";
import { usersInAuth, pronunciationScores, conversationSessions, conversationMessages, aiUsageLog, ieltsAttempts, vocabularyProgress, vocabularyWords, listeningAttempts, listeningExercises, dailyPlans, uiLanguages, uiTranslations, userRoles, speakingAttempts, speakingQuestions, pronunciationAttempts, vocabularyTranslations, subscriptions, grammarLessons, grammarTranslations, billingEvents, usageCounters, complimentaryAccess, adminAuditLog, aiSpeakingMemory, profiles, aiSpeakingSessions, aiSpeakingMistakes, shadowingTopics, shadowingSentences, shadowingProgress, coachSessions, coachTopics, coachTurns, listeningProgress, listeningLessons, sessionsInAuth, oauthAccountsInAuth, speakingTestProgress, speakingTests, passwordResetTokensInAuth, emailVerificationTokensInAuth } from "./schema";

export const pronunciationScoresRelations = relations(pronunciationScores, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [pronunciationScores.userId],
		references: [usersInAuth.id]
	}),
}));

export const usersInAuthRelations = relations(usersInAuth, ({many}) => ({
	pronunciationScores: many(pronunciationScores),
	conversationSessions: many(conversationSessions),
	conversationMessages: many(conversationMessages),
	aiUsageLogs: many(aiUsageLog),
	ieltsAttempts: many(ieltsAttempts),
	vocabularyProgresses: many(vocabularyProgress),
	listeningAttempts: many(listeningAttempts),
	dailyPlans: many(dailyPlans),
	uiTranslations: many(uiTranslations),
	userRoles: many(userRoles),
	speakingAttempts: many(speakingAttempts),
	pronunciationAttempts: many(pronunciationAttempts),
	subscriptions: many(subscriptions),
	billingEvents: many(billingEvents),
	usageCounters: many(usageCounters),
	complimentaryAccesses_userId: many(complimentaryAccess, {
		relationName: "complimentaryAccess_userId_usersInAuth_id"
	}),
	complimentaryAccesses_grantedBy: many(complimentaryAccess, {
		relationName: "complimentaryAccess_grantedBy_usersInAuth_id"
	}),
	adminAuditLogs_actorId: many(adminAuditLog, {
		relationName: "adminAuditLog_actorId_usersInAuth_id"
	}),
	adminAuditLogs_targetUserId: many(adminAuditLog, {
		relationName: "adminAuditLog_targetUserId_usersInAuth_id"
	}),
	aiSpeakingMemories: many(aiSpeakingMemory),
	profiles: many(profiles),
	aiSpeakingSessions: many(aiSpeakingSessions),
	aiSpeakingMistakes: many(aiSpeakingMistakes),
	shadowingProgresses: many(shadowingProgress),
	coachSessions: many(coachSessions),
	coachTurns: many(coachTurns),
	listeningProgresses: many(listeningProgress),
	sessionsInAuths: many(sessionsInAuth),
	oauthAccountsInAuths: many(oauthAccountsInAuth),
	speakingTestProgresses: many(speakingTestProgress),
	passwordResetTokensInAuths: many(passwordResetTokensInAuth),
	emailVerificationTokensInAuths: many(emailVerificationTokensInAuth),
}));

export const conversationSessionsRelations = relations(conversationSessions, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [conversationSessions.userId],
		references: [usersInAuth.id]
	}),
	conversationMessages: many(conversationMessages),
}));

export const conversationMessagesRelations = relations(conversationMessages, ({one}) => ({
	conversationSession: one(conversationSessions, {
		fields: [conversationMessages.sessionId],
		references: [conversationSessions.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [conversationMessages.userId],
		references: [usersInAuth.id]
	}),
}));

export const aiUsageLogRelations = relations(aiUsageLog, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [aiUsageLog.userId],
		references: [usersInAuth.id]
	}),
}));

export const ieltsAttemptsRelations = relations(ieltsAttempts, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [ieltsAttempts.userId],
		references: [usersInAuth.id]
	}),
}));

export const vocabularyProgressRelations = relations(vocabularyProgress, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [vocabularyProgress.userId],
		references: [usersInAuth.id]
	}),
	vocabularyWord: one(vocabularyWords, {
		fields: [vocabularyProgress.wordId],
		references: [vocabularyWords.id]
	}),
}));

export const vocabularyWordsRelations = relations(vocabularyWords, ({many}) => ({
	vocabularyProgresses: many(vocabularyProgress),
	vocabularyTranslations: many(vocabularyTranslations),
}));

export const listeningAttemptsRelations = relations(listeningAttempts, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [listeningAttempts.userId],
		references: [usersInAuth.id]
	}),
	listeningExercise: one(listeningExercises, {
		fields: [listeningAttempts.exerciseId],
		references: [listeningExercises.id]
	}),
}));

export const listeningExercisesRelations = relations(listeningExercises, ({many}) => ({
	listeningAttempts: many(listeningAttempts),
}));

export const dailyPlansRelations = relations(dailyPlans, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [dailyPlans.userId],
		references: [usersInAuth.id]
	}),
}));

export const uiTranslationsRelations = relations(uiTranslations, ({one}) => ({
	uiLanguage: one(uiLanguages, {
		fields: [uiTranslations.locale],
		references: [uiLanguages.code]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [uiTranslations.updatedBy],
		references: [usersInAuth.id]
	}),
}));

export const uiLanguagesRelations = relations(uiLanguages, ({many}) => ({
	uiTranslations: many(uiTranslations),
	vocabularyTranslations: many(vocabularyTranslations),
	grammarTranslations: many(grammarTranslations),
}));

export const userRolesRelations = relations(userRoles, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [userRoles.userId],
		references: [usersInAuth.id]
	}),
}));

export const speakingAttemptsRelations = relations(speakingAttempts, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [speakingAttempts.userId],
		references: [usersInAuth.id]
	}),
	speakingQuestion: one(speakingQuestions, {
		fields: [speakingAttempts.questionId],
		references: [speakingQuestions.id]
	}),
}));

export const speakingQuestionsRelations = relations(speakingQuestions, ({many}) => ({
	speakingAttempts: many(speakingAttempts),
}));

export const pronunciationAttemptsRelations = relations(pronunciationAttempts, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [pronunciationAttempts.userId],
		references: [usersInAuth.id]
	}),
}));

export const vocabularyTranslationsRelations = relations(vocabularyTranslations, ({one}) => ({
	vocabularyWord: one(vocabularyWords, {
		fields: [vocabularyTranslations.wordId],
		references: [vocabularyWords.id]
	}),
	uiLanguage: one(uiLanguages, {
		fields: [vocabularyTranslations.locale],
		references: [uiLanguages.code]
	}),
}));

export const subscriptionsRelations = relations(subscriptions, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [subscriptions.userId],
		references: [usersInAuth.id]
	}),
}));

export const grammarTranslationsRelations = relations(grammarTranslations, ({one}) => ({
	grammarLesson: one(grammarLessons, {
		fields: [grammarTranslations.lessonId],
		references: [grammarLessons.id]
	}),
	uiLanguage: one(uiLanguages, {
		fields: [grammarTranslations.locale],
		references: [uiLanguages.code]
	}),
}));

export const grammarLessonsRelations = relations(grammarLessons, ({many}) => ({
	grammarTranslations: many(grammarTranslations),
}));

export const billingEventsRelations = relations(billingEvents, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [billingEvents.userId],
		references: [usersInAuth.id]
	}),
}));

export const usageCountersRelations = relations(usageCounters, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [usageCounters.userId],
		references: [usersInAuth.id]
	}),
}));

export const complimentaryAccessRelations = relations(complimentaryAccess, ({one}) => ({
	usersInAuth_userId: one(usersInAuth, {
		fields: [complimentaryAccess.userId],
		references: [usersInAuth.id],
		relationName: "complimentaryAccess_userId_usersInAuth_id"
	}),
	usersInAuth_grantedBy: one(usersInAuth, {
		fields: [complimentaryAccess.grantedBy],
		references: [usersInAuth.id],
		relationName: "complimentaryAccess_grantedBy_usersInAuth_id"
	}),
}));

export const adminAuditLogRelations = relations(adminAuditLog, ({one}) => ({
	usersInAuth_actorId: one(usersInAuth, {
		fields: [adminAuditLog.actorId],
		references: [usersInAuth.id],
		relationName: "adminAuditLog_actorId_usersInAuth_id"
	}),
	usersInAuth_targetUserId: one(usersInAuth, {
		fields: [adminAuditLog.targetUserId],
		references: [usersInAuth.id],
		relationName: "adminAuditLog_targetUserId_usersInAuth_id"
	}),
}));

export const aiSpeakingMemoryRelations = relations(aiSpeakingMemory, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [aiSpeakingMemory.userId],
		references: [usersInAuth.id]
	}),
}));

export const profilesRelations = relations(profiles, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [profiles.id],
		references: [usersInAuth.id]
	}),
}));

export const aiSpeakingSessionsRelations = relations(aiSpeakingSessions, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [aiSpeakingSessions.userId],
		references: [usersInAuth.id]
	}),
	aiSpeakingMistakes: many(aiSpeakingMistakes),
}));

export const aiSpeakingMistakesRelations = relations(aiSpeakingMistakes, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [aiSpeakingMistakes.userId],
		references: [usersInAuth.id]
	}),
	aiSpeakingSession: one(aiSpeakingSessions, {
		fields: [aiSpeakingMistakes.sessionId],
		references: [aiSpeakingSessions.id]
	}),
}));

export const shadowingSentencesRelations = relations(shadowingSentences, ({one, many}) => ({
	shadowingTopic: one(shadowingTopics, {
		fields: [shadowingSentences.topicId],
		references: [shadowingTopics.id]
	}),
	shadowingProgresses: many(shadowingProgress),
}));

export const shadowingTopicsRelations = relations(shadowingTopics, ({many}) => ({
	shadowingSentences: many(shadowingSentences),
}));

export const shadowingProgressRelations = relations(shadowingProgress, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [shadowingProgress.userId],
		references: [usersInAuth.id]
	}),
	shadowingSentence: one(shadowingSentences, {
		fields: [shadowingProgress.sentenceId],
		references: [shadowingSentences.id]
	}),
}));

export const coachSessionsRelations = relations(coachSessions, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [coachSessions.userId],
		references: [usersInAuth.id]
	}),
	coachTopic: one(coachTopics, {
		fields: [coachSessions.topicId],
		references: [coachTopics.id]
	}),
	coachTurns: many(coachTurns),
}));

export const coachTopicsRelations = relations(coachTopics, ({many}) => ({
	coachSessions: many(coachSessions),
}));

export const coachTurnsRelations = relations(coachTurns, ({one}) => ({
	coachSession: one(coachSessions, {
		fields: [coachTurns.sessionId],
		references: [coachSessions.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [coachTurns.userId],
		references: [usersInAuth.id]
	}),
}));

export const listeningProgressRelations = relations(listeningProgress, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [listeningProgress.userId],
		references: [usersInAuth.id]
	}),
	listeningLesson: one(listeningLessons, {
		fields: [listeningProgress.lessonId],
		references: [listeningLessons.id]
	}),
}));

export const listeningLessonsRelations = relations(listeningLessons, ({many}) => ({
	listeningProgresses: many(listeningProgress),
}));

export const sessionsInAuthRelations = relations(sessionsInAuth, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [sessionsInAuth.userId],
		references: [usersInAuth.id]
	}),
}));

export const oauthAccountsInAuthRelations = relations(oauthAccountsInAuth, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [oauthAccountsInAuth.userId],
		references: [usersInAuth.id]
	}),
}));

export const speakingTestProgressRelations = relations(speakingTestProgress, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [speakingTestProgress.userId],
		references: [usersInAuth.id]
	}),
	speakingTest: one(speakingTests, {
		fields: [speakingTestProgress.testId],
		references: [speakingTests.id]
	}),
}));

export const speakingTestsRelations = relations(speakingTests, ({many}) => ({
	speakingTestProgresses: many(speakingTestProgress),
}));

export const passwordResetTokensInAuthRelations = relations(passwordResetTokensInAuth, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [passwordResetTokensInAuth.userId],
		references: [usersInAuth.id]
	}),
}));

export const emailVerificationTokensInAuthRelations = relations(emailVerificationTokensInAuth, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [emailVerificationTokensInAuth.userId],
		references: [usersInAuth.id]
	}),
}));