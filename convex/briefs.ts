import { v } from 'convex/values';
import { ok, err, Result } from 'neverthrow';

import { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { internalQuery, internalMutation, internalAction } from './_generated/server';
import {
  BriefContent,
  TIME_CONSTANTS,
  safeGenerateText,
  ProcessingError,
  formatBriefContent,
  safeExtractContent,
  calculateNextBriefTime,
} from './utils';

interface ArticleResult {
  url: string;
  title: string;
  content: string;
  summary: string;
  translations: Array<{
    text: string;
    language: string;
  }>;
}

const processArticleContent = async (
  url: string,
  targetLanguage?: string,
): Promise<Result<ArticleResult, ProcessingError>> => {
  const extractContentResult = await safeExtractContent(url);
  if (extractContentResult.isErr()) return err(extractContentResult.error);

  const extractedContent = extractContentResult.value.data;

  const summaryResult = await safeGenerateText(
    `Provide a concise 2-sentence summary of this article:\n\n${extractedContent.content}`,
  );
  if (summaryResult.isErr()) return err(summaryResult.error);

  const translations: Array<{ text: string; language: string }> = [];

  if (targetLanguage && targetLanguage !== 'en') {
    const translationResult = await safeGenerateText(
      `Translate this summary to ${targetLanguage}, maintaining tone and meaning:\n\n${summaryResult.value}`,
    );
    if (translationResult.isOk()) {
      translations.push({ text: translationResult.value, language: targetLanguage });
    }
  }

  return ok({
    url,
    title: extractedContent.title,
    content: extractedContent.content,
    summary: summaryResult.value,
    translations,
  });
};

export const getUserPreferences = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query('preferences')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
  },
});

export const getUsersReadyForBrief = internalQuery({
  args: { dayOfWeek: v.number(), hour: v.number() },
  handler: async (ctx, { dayOfWeek, hour }) => {
    return await ctx.db
      .query('preferences')
      .withIndex('by_brief_schedule', (q) => q.eq('briefSchedule.dayOfWeek', dayOfWeek).eq('briefSchedule.hour', hour))
      .collect();
  },
});

export const getRecentArticlesForUser = internalQuery({
  args: { userId: v.id('users'), since: v.number() },
  handler: async (ctx, { userId, since }) => {
    const userTopics = await ctx.db
      .query('topicFeeds')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    if (userTopics.length === 0) return [];

    const feedIds = userTopics.map((t) => t.feedId);
    const allArticles = [];

    for (const feedId of feedIds) {
      const articles = await ctx.db
        .query('articles')
        .withIndex('by_feed_and_published', (q) => q.eq('feedId', feedId).gte('publishedAt', since))
        .order('desc')
        .take(5);
      allArticles.push(...articles);
    }

    const topicMap = new Map();
    for (const userTopic of userTopics) {
      const topic = await ctx.db.get(userTopic.topicId);
      if (topic) {
        topicMap.set(userTopic.feedId, topic);
      }
    }

    return allArticles
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, 20)
      .map((article) => ({
        ...article,
        topic: topicMap.get(article.feedId),
      }))
      .filter((article) => article.topic);
  },
});

export const createBrief = internalMutation({
  args: {
    userId: v.id('users'),
    content: v.string(),
  },
  handler: async (ctx, { userId, content }) => {
    return await ctx.db.insert('briefs', {
      userId,
      content,
      status: 'pending',
    });
  },
});

export const updateBriefStatus = internalMutation({
  args: {
    briefId: v.id('briefs'),
    status: v.union(v.literal('pending'), v.literal('sent'), v.literal('failed')),
    sentAt: v.optional(v.number()),
  },
  handler: async (ctx, { briefId, status, sentAt }) => {
    return await ctx.db.patch(briefId, { status, sentAt });
  },
});

export const generateBriefForUser = internalAction({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }): Promise<Id<'briefs'> | undefined> => {
    const preferences = await ctx.runQuery(internal.briefs.getUserPreferences, { userId });
    if (!preferences) {
      console.log(`No preferences found for user ${userId}`);
      return;
    }

    const oneWeekAgo = Date.now() - TIME_CONSTANTS.ONE_WEEK;
    const articles = await ctx.runQuery(internal.briefs.getRecentArticlesForUser, {
      userId,
      since: oneWeekAgo,
    });

    if (articles.length === 0) {
      console.log(`No recent articles found for user ${userId}`);
      return;
    }

    const topicGroups = new Map<string, typeof articles>();
    for (const article of articles) {
      const topicName = article.topic.name;
      if (!topicGroups.has(topicName)) {
        topicGroups.set(topicName, []);
      }
      topicGroups.get(topicName)!.push(article);
    }

    const briefContent: BriefContent = {
      topics: [],
      generatedAt: Date.now(),
      userTimezone: preferences.briefSchedule.timezone,
    };

    for (const [topicName, topicArticles] of topicGroups) {
      const processedArticles = [];

      for (const article of topicArticles.slice(0, 3)) {
        const targetLanguage = preferences.briefSchedule.translation.enabled
          ? preferences.briefSchedule.translation.language
          : undefined;

        const processedResult = await processArticleContent(article.url, targetLanguage);

        if (processedResult.isOk()) {
          const processed = processedResult.value;
          processedArticles.push({
            title: processed.title,
            url: processed.url,
            summary: processed.summary,
            translation: processed.translations[0]?.text,
          });
        }
      }

      if (processedArticles.length > 0) {
        briefContent.topics.push({
          name: topicName,
          articles: processedArticles,
        });
      }
    }

    if (briefContent.topics.length === 0) {
      console.log(`No processable articles found for user ${userId}`);
      return;
    }

    const briefText = formatBriefContent(briefContent);
    const briefId: Id<'briefs'> = await ctx.runMutation(internal.briefs.createBrief, {
      userId,
      content: briefText,
    });

    console.log(`Brief generated for user ${userId}, briefId: ${briefId}`);
    return briefId;
  },
});

export const getNextBriefSchedule = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const preferences = await ctx.db
      .query('preferences')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();

    if (!preferences) {
      return null;
    }

    return calculateNextBriefTime({
      timezone: preferences.briefSchedule.timezone,
      scheduledHour: preferences.briefSchedule.hour,
      scheduledDayOfWeek: preferences.briefSchedule.dayOfWeek,
    });
  },
});

export const generateScheduledBriefs = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentDayOfWeek = now.getUTCDay();

    console.log(`Checking for briefs to generate at UTC ${currentHour}:00 on day ${currentDayOfWeek}`);

    for (let timezoneOffset = -12; timezoneOffset <= 14; timezoneOffset++) {
      const localHour = (currentHour + timezoneOffset + 24) % 24;
      const localDayOfWeek = currentDayOfWeek;

      const users = await ctx.runQuery(internal.briefs.getUsersReadyForBrief, {
        dayOfWeek: localDayOfWeek,
        hour: localHour,
      });

      console.log(`Found ${users.length} users ready for brief at local time ${localHour}:00`);

      for (const user of users) {
        try {
          await ctx.runAction(internal.briefs.generateBriefForUser, {
            userId: user.userId,
          });
        } catch (error) {
          console.error(`Failed to generate brief for user ${user.userId}:`, error);
        }
      }
    }
  },
});
