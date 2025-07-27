import ky from 'ky';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { ok, err, Result, fromPromise } from 'neverthrow';
import { v } from 'convex/values';
import { internalQuery, internalMutation, internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { Id } from './_generated/dataModel';

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

interface ProcessingError {
  step: string;
  message: string;
}

interface BriefContent {
  topics: Array<{
    name: string;
    articles: Array<{
      title: string;
      url: string;
      summary: string;
      translation?: string;
    }>;
  }>;
  generatedAt: number;
  userTimezone: string;
}

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const AI_CONFIG = {
  maxTokens: 500,
  model: openai('gpt-4o-mini'),
} as const;

const safeGenerateText = (prompt: string) =>
  fromPromise(
    generateText({ prompt, ...AI_CONFIG }).then((r) => r.text),
    (error) => ({ message: `AI generation failed: ${error}`, step: 'ai-generation' }),
  );

interface ExtractedContentResponse {
  code: number;
  status: number;
  data: {
    title: string;
    description: string;
    url: string;
    content: string;
  };
}

const safeExtractContent = (url: string) =>
  fromPromise(
    ky
      .get(`https://r.jina.ai/${encodeURIComponent(url)}`, {
        timeout: 10000,
        headers: {
          accept: 'application/json',
        },
      })
      .then((response) => response.json<ExtractedContentResponse>()),
    (error) => ({ message: `Content extraction failed: ${error}`, step: 'content-extraction' }),
  );

const processArticleContent = async (url: string, targetLanguage?: string): Promise<Result<ArticleResult, ProcessingError>> => {
  const extractContentResult = await safeExtractContent(url);
  if (extractContentResult.isErr()) return err(extractContentResult.error);

  const extractedContent = extractContentResult.value.data;

  const summaryResult = await safeGenerateText(
    `Provide a concise 2-sentence summary of this article:\n\n${extractedContent.content}`,
  );
  if (summaryResult.isErr()) return err(summaryResult.error);

  const translations: Array<{ text: string; language: string; }> = [];
  
  if (targetLanguage && targetLanguage !== 'en') {
    const translationResult = await safeGenerateText(
      `Translate this summary to ${targetLanguage}, maintaining tone and meaning:\n\n${summaryResult.value}`
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
      .withIndex('by_brief_schedule', (q) => 
        q.eq('briefSchedule.dayOfWeek', dayOfWeek).eq('briefSchedule.hour', hour)
      )
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

    const feedIds = userTopics.map(t => t.feedId);
    const allArticles = [];

    for (const feedId of feedIds) {
      const articles = await ctx.db
        .query('articles')
        .withIndex('by_feed_and_published', (q) => 
          q.eq('feedId', feedId).gte('publishedAt', since)
        )
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
      .map(article => ({
        ...article,
        topic: topicMap.get(article.feedId)
      }))
      .filter(article => article.topic);
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

    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
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

function formatBriefContent(content: BriefContent): string {
  const date = new Date(content.generatedAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: content.userTimezone,
  });

  let brief = `# Your Weekly Brief - ${date}\n\n`;
  brief += `Here's what's been happening in your followed topics:\n\n`;

  for (const topic of content.topics) {
    brief += `## ${topic.name}\n\n`;
    
    for (const article of topic.articles) {
      brief += `### [${article.title}](${article.url})\n`;
      brief += `${article.summary}\n`;
      
      if (article.translation) {
        brief += `\n*Translation: ${article.translation}*\n`;
      }
      
      brief += `\n---\n\n`;
    }
  }

  brief += `\n*This brief was generated automatically based on your followed topics.*`;
  return brief;
}

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
