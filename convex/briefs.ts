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
import { components } from './_generated/api';
import { Resend } from '@convex-dev/resend';

const resend: Resend = new Resend(components.resend, {});

import {
  TIME_CONSTANTS,
  safeGenerateText,
  ProcessingError,
  safeExtractContent,
  safeRunAction,
  createPrompt,
} from './utils';

export const getUserData = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

export const getUserPreferenceQuery = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    return await getUserPreferences(ctx, userId);
  },
});

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
      hour: userPreferences.brief.schedule.hour,
      timezone: userPreferences.brief.schedule.timezone,
      dayOfWeek: userPreferences.brief.schedule.dayOfWeek,
    });
  },
});

interface ProcessedFeedItem {
  url: string;
  title: string;
  summary: string;
}

const processFeedItem = async (
  url: string,
  style: 'concise' | 'detailed',
): Promise<Result<ProcessedFeedItem, ProcessingError>> => {
  const extractContentResult = await safeExtractContent(url);
  if (extractContentResult.isErr()) return err(extractContentResult.error);

  const extractedContent = extractContentResult.value.data;

  const prompt = createPrompt(extractedContent.content, style);

  const summaryResult = await safeGenerateText(prompt);
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

export const getBriefItemsWithTopics = internalQuery({
  args: {
    userId: v.id('users'),
    since: v.optional(v.number()),
  },
  handler: async (ctx, { userId, since }) => {
    let briefsQuery = ctx.db.query('briefItems').withIndex('by_user', (q) => q.eq('userId', userId));

    if (since) {
      briefsQuery = briefsQuery.filter((q) => q.gt(q.field('_creationTime'), since));
    }

    const briefs = await briefsQuery.order('desc').collect();

    const feedItemIds = briefs.map((b) => b.feedItemId);
    const feedItems = await Promise.all(feedItemIds.map((id) => ctx.db.get(id)));

    const feedIds = [...new Set(feedItems.filter(Boolean).map((fi) => fi!.feedId))];
    const topicFeeds = await Promise.all(
      feedIds.map((feedId) =>
        ctx.db
          .query('topicFeeds')
          .withIndex('by_feed', (q) => q.eq('feedId', feedId))
          .first(),
      ),
    );

    const topicIds = [...new Set(topicFeeds.filter(Boolean).map((tf) => tf!.topicId))];
    const topics = await Promise.all(topicIds.map((id) => ctx.db.get(id)));

    const feedItemMap = new Map(feedItems.filter(Boolean).map((fi) => [fi!._id, fi!]));
    const topicFeedMap = new Map(topicFeeds.filter(Boolean).map((tf) => [tf!.feedId, tf!]));
    const topicMap = new Map(topics.filter(Boolean).map((t) => [t!._id, t!]));

    return briefs.map((brief) => {
      const feedItem = feedItemMap.get(brief.feedItemId);
      const topicFeed = feedItem ? topicFeedMap.get(feedItem.feedId) : null;
      const topic = topicFeed ? topicMap.get(topicFeed.topicId) : null;

      return {
        id: brief._id,
        userId: brief.userId,
        feedItemId: brief.feedItemId,
        summary: brief.summary,
        url: brief.url,
        title: brief.title,
        createdAt: brief._creationTime,
        topicName: topic?.name || 'Unknown',
        topicId: topic?._id || null,
      };
    });
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
        const processResult = await processFeedItem(feedItem.url, userPreferences.brief.style);
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

interface WeeklyDigest {
  userId: string;
  totalBriefs: number;
  topicSummaries: Array<{
    topicName: string;
    count: number;
    topArticles: Array<{
      title: string;
      url: string;
      summary: string;
    }>;
  }>;
  weekPeriod: {
    start: string;
    end: string;
  };
}

export const generateWeeklyDigest = internalAction({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const userPreferences = await ctx.runQuery(internal.briefs.getUserPreferenceQuery, { userId });
    if (!userPreferences || !userPreferences.notifications.email) {
      return null;
    }

    const user = await ctx.runQuery(internal.briefs.getUserData, { userId });
    if (!user?.email) {
      console.warn(`User ${userId} has no email address`);
      return null;
    }

    const oneWeekAgo = Date.now() - TIME_CONSTANTS.ONE_WEEK;

    const briefsWithTopics = await ctx.runQuery(internal.briefs.getBriefItemsWithTopics, {
      userId,
      since: oneWeekAgo,
    });

    const topicGroups = new Map<string, typeof briefsWithTopics>();
    briefsWithTopics.forEach((brief) => {
      const topicName = brief.topicName;
      if (!topicGroups.has(topicName)) {
        topicGroups.set(topicName, []);
      }
      topicGroups.get(topicName)!.push(brief);
    });

    const maxArticles = userPreferences.brief.style === 'detailed' ? 5 : 1;
    const topicSummaries = Array.from(topicGroups.entries()).map(([topicName, briefs]) => ({
      topicName,
      count: briefs.length,
      topArticles: briefs
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, maxArticles)
        .map((brief) => ({
          url: brief.url,
          title: brief.title,
          summary: brief.summary,
        })),
    }));

    const weekStart = new Date(oneWeekAgo).toISOString().split('T')[0];
    const weekEnd = new Date().toISOString().split('T')[0];

    const digest: WeeklyDigest = {
      userId,
      totalBriefs: briefsWithTopics.length,
      topicSummaries,
      weekPeriod: {
        start: weekStart,
        end: weekEnd,
      },
    };

    // TODO: Format the digest content as needed
    const emailId = await resend.sendEmail(ctx, {
      to: user.email,
      from: `RSSBrief <onboarding@resend.dev>`,
      subject: `Your Weekly RSSBrief Digest (${weekStart} - ${weekEnd})`,
      text: 'Digest content here',
    });

    if (!emailId) {
      console.error(`Failed to send weekly digest email to user ${userId}`);
      return null;
    }

    console.log(`Weekly digest email sent successfully to user ${userId}`);
    return digest;
  },
});

export const getUsersNeedingWeeklyDigest = internalQuery({
  args: {},
  handler: async (ctx) => {
    const currentTime = new Date();
    const currentHour = currentTime.getUTCHours();
    const currentDay = currentTime.getUTCDay();

    const preferences = await ctx.db
      .query('preferences')
      .withIndex('by_brief_schedule', (q) =>
        q.eq('brief.schedule.hour', currentHour).eq('brief.schedule.dayOfWeek', currentDay),
      )
      .filter((q) => q.and(q.eq(q.field('onboarded'), true), q.eq(q.field('notifications.email'), true)))
      .collect();

    return preferences.map((pref) => ({
      userId: pref.userId,
      timezone: pref.brief.schedule.timezone,
    }));
  },
});

export const generateScheduledWeeklyDigests = internalAction({
  args: {},
  handler: async (ctx) => {
    const usersNeedingDigests = await ctx.runQuery(internal.briefs.getUsersNeedingWeeklyDigest, {});

    console.log(`Found ${usersNeedingDigests.length} users needing weekly digests`);

    const concurrencyLimit = pLimit(3);
    const digestPromises = usersNeedingDigests.map(({ userId }) =>
      concurrencyLimit(async () => {
        const result = await safeRunAction(ctx.runAction(internal.briefs.generateWeeklyDigest, { userId }));

        if (result.isErr()) {
          console.error(`Failed to generate weekly digest for user ${userId}:`, result.error);
          return null;
        }

        const digest = result.value;
        if (digest) {
          console.log(`Successfully generated weekly digest for user ${userId}`);
        }
        return digest;
      }),
    );

    const results = await Promise.all(digestPromises);
    const successCount = results.filter((result) => result !== null).length;
    console.log(`Generated ${successCount} weekly digests out of ${usersNeedingDigests.length} users`);
  },
});

interface UserBrief {
  id: string;
  url: string;
  title: string;
  summary: string;
  createdAt: string;
  topic: { id: string; name: string } | null;
}

export const getUserBriefs = query({
  args: {},
  handler: async (ctx): Promise<UserBrief[]> => {
    const userId = requireAuth(await getAuthUserId(ctx));
    const userPreferences = await getUserPreferences(ctx, userId);

    if (!userPreferences) {
      return [];
    }

    const briefsWithTopics = await ctx.runQuery(internal.briefs.getBriefItemsWithTopics, { userId });

    return briefsWithTopics.map((brief) => ({
      id: brief.id,
      url: brief.url,
      title: brief.title,
      summary: brief.summary,
      createdAt: new Date(brief.createdAt).toISOString(),
      topic: brief.topicId ? { id: brief.topicId, name: brief.topicName } : null,
    }));
  },
});
