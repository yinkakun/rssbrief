import { v } from 'convex/values';
import { ok, err, Result } from 'neverthrow';
import { ConvexError } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { internal } from './_generated/api';
import { requireAuth } from './utils';
import { internalQuery, internalMutation, internalAction, query } from './_generated/server';
import { getUserPreferences } from './users';
import { Doc } from './_generated/dataModel';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import pLimit from 'p-limit';

import { TIME_CONSTANTS, safeGenerateText, ProcessingError, safeExtractContent } from './utils';

function getNextScheduledTime({ dayOfWeek, hour, timezone }: { hour: number; dayOfWeek: number; timezone: string }) {
  const nowInTimezone = toZonedTime(new Date(), timezone);

  const currentDay = nowInTimezone.getDay();
  let daysUntilTarget = (dayOfWeek - currentDay + 7) % 7;

  if (daysUntilTarget === 0) {
    const currentHour = nowInTimezone.getHours();
    if (currentHour >= hour) {
      daysUntilTarget = 7;
    }
  }

  const targetDate = new Date(nowInTimezone);
  targetDate.setDate(targetDate.getDate() + daysUntilTarget);
  targetDate.setHours(hour, 0, 0, 0);

  return fromZonedTime(targetDate, timezone).toISOString();
}

export const getNextBriefSchedule = query({
  args: {},
  handler: async (ctx) => {
    const userId = requireAuth(await getAuthUserId(ctx));
    const userPreferences = await getUserPreferences(ctx, userId);

    if (!userPreferences) {
      return null;
    }

    return getNextScheduledTime({
      timezone: userPreferences.brief.schedule.timezone,
      hour: userPreferences.brief.schedule.hour,
      dayOfWeek: userPreferences.brief.schedule.dayOfWeek,
    });
  },
});

interface ProcessedFeedItem {
  url: string;
  title: string;
  summary: string;
}

const processFeedItem = async (url: string): Promise<Result<ProcessedFeedItem, ProcessingError>> => {
  const extractContentResult = await safeExtractContent(url);
  if (extractContentResult.isErr()) return err(extractContentResult.error);

  const extractedContent = extractContentResult.value.data;

  const summaryResult = await safeGenerateText(
    `Provide a concise 2-sentence summary of this:\n\n${extractedContent.content}`,
  );
  if (summaryResult.isErr()) return err(summaryResult.error);

  return ok({
    url,
    summary: summaryResult.value,
    title: extractedContent.title,
  });
};

export const getUserFeedItems = internalQuery({
  args: {
    since: v.number(),
    userId: v.id('users'),
  },
  handler: async (ctx, { userId, since }) => {
    const userTopicFeeds = await ctx.db
      .query('topicFeeds')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    if (userTopicFeeds.length === 0) {
      return [];
    }

    const feedIds = userTopicFeeds.map((tf) => tf.feedId);
    const allFeedItems: Doc<'feedItems'>[] = [];

    for (const feedId of feedIds) {
      const feedItems = await ctx.db
        .query('feedItems')
        .withIndex('by_feed_and_published', (q) => q.eq('feedId', feedId).gt('publishedAt', since))
        .order('desc')
        .collect();

      allFeedItems.push(...feedItems);
    }

    allFeedItems.sort((a, b) => b.publishedAt - a.publishedAt);

    return allFeedItems;
  },
});

export const getUserPreferenceQuery = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    return await getUserPreferences(ctx, userId);
  },
});

export const getExistingBriefItems = internalQuery({
  args: {
    userId: v.id('users'),
    feedItemIds: v.array(v.id('feedItems')),
  },
  handler: async (ctx, { userId, feedItemIds }) => {
    const existingBriefs = await ctx.db
      .query('briefItems')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    const existingFeedItemIds = new Set(
      existingBriefs.filter((brief) => feedItemIds.includes(brief.feedItemId)).map((brief) => brief.feedItemId),
    );

    return Array.from(existingFeedItemIds);
  },
});

export const saveBriefItem = internalMutation({
  args: {
    userId: v.id('users'),
    feedItemId: v.id('feedItems'),
    title: v.string(),
    summary: v.string(),
    url: v.string(),
  },
  handler: async (ctx, { feedItemId, userId, summary, title, url }) => {
    const existing = await ctx.db
      .query('briefItems')
      .withIndex('by_user_and_feedItem', (q) => q.eq('userId', userId).eq('feedItemId', feedItemId))
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert('briefItems', {
      url,
      title,
      userId,
      summary,
      feedItemId,
    });
  },
});

export const updateUserBriefs = internalAction({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const userPreferences = await ctx.runQuery(internal.briefs.getUserPreferenceQuery, { userId });
    if (!userPreferences) {
      throw new ConvexError(`User preferences not found for user ${userId}`);
    }

    const oneWeekAgo = Date.now() - TIME_CONSTANTS.ONE_WEEK;
    const feedItems = await ctx.runQuery(internal.briefs.getUserFeedItems, {
      userId,
      since: oneWeekAgo,
    });

    const feedItemIds = feedItems.map((item) => item._id);
    const existingBriefItemIds = await ctx.runQuery(internal.briefs.getExistingBriefItems, {
      userId,
      feedItemIds,
    });

    const feedItemsToProcess = feedItems.filter((item) => !existingBriefItemIds.includes(item._id));

    console.log(`Found ${feedItems.length} total feed items, ${feedItemsToProcess.length} need processing`);

    const concurrencyLimit = pLimit(5);
    const processPromises = feedItemsToProcess.map((feedItem) =>
      concurrencyLimit(async () => {
        const processResult = await processFeedItem(feedItem.url);
        if (processResult.isErr()) {
          console.warn(`Failed to process feed item ${feedItem.url}:`, processResult.error);
          return null;
        }

        await ctx.runMutation(internal.briefs.saveBriefItem, {
          userId,
          url: feedItem.url,
          feedItemId: feedItem._id,
          title: processResult.value.title,
          summary: processResult.value.summary,
        });

        return {
          url: feedItem.url,
          title: processResult.value.title,
          summary: processResult.value.summary,
        };
      }),
    );

    const processedItems = (await Promise.all(processPromises)).filter((item) => item !== null) as ProcessedFeedItem[];
    return processedItems;
  },
});

export const getUserBriefs = query({
  args: {},
  handler: async (ctx) => {
    const userId = requireAuth(await getAuthUserId(ctx));
    const userPreferences = await getUserPreferences(ctx, userId);

    if (!userPreferences) {
      return [];
    }

    const briefs = await ctx.db
      .query('briefItems')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .order('desc')
      .collect();

    return briefs.map((brief) => ({
      id: brief._id,
      url: brief.url,
      title: brief.title,
      summary: brief.summary,
      createdAt: new Date(brief._creationTime).toISOString(),
    }));
  },
});
