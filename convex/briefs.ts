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
import { mutation } from './_generated/server';
import type { Id } from './_generated/dataModel';
import type { ProcessedFeedItem } from './utils';

const resend: Resend = new Resend(components.resend, {
  testMode: false,
});

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

const createWeeklyDigestEmailText = (digest: WeeklyDigest): string => {
  const { totalBriefs, topicSummaries, weekPeriod } = digest;

  let emailText = `Your Weekly RSSBrief Digest\n`;
  emailText += `Week of ${weekPeriod.start} to ${weekPeriod.end}\n\n`;

  if (totalBriefs === 0) {
    emailText += `No new briefs this week.\n\n`;
  } else {
    emailText += `This Week's Summary:\n`;
    emailText += `- Topics: ${topicSummaries.length}\n\n`;

    emailText += `Topics Overview:\n`;
    topicSummaries
      .sort((a, b) => b.count - a.count)
      .forEach((topic) => {
        emailText += `- ${topic.topicName}: ${topic.count} article${topic.count !== 1 ? 's' : ''}\n`;
      });

    emailText += `\n`;

    topicSummaries
      .sort((a, b) => b.count - a.count)
      .forEach((topic, index) => {
        emailText += `${topic.topicName.toUpperCase()}\n`;
        emailText += `${'='.repeat(topic.topicName.length)}\n\n`;

        const itemsToShow = topic.topItems.slice(0, 3);

        itemsToShow.forEach((item, index) => {
          emailText += `${index + 1}. ${item.title}\n`;
          emailText += `   ${item.summary}\n`;
          emailText += `   Link: ${item.url}\n\n`;
        });

        if (index < topicSummaries.length - 1) {
          emailText += `${'-'.repeat(50)}\n\n`;
        }
      });
  }

  emailText += `\n${'='.repeat(50)}\n\n`;
  emailText += `You're receiving this digest because you have email notifications enabled.\n`;
  emailText += `To modify your preferences or unsubscribe, visit your RSSBrief settings.\n\n`;
  emailText += `Happy reading!\n`;
  emailText += `The RSSBrief Team`;

  return emailText;
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
    topItems: Array<{
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

    const topicSummaries = Array.from(topicGroups.entries()).map(([topicName, briefs]) => ({
      topicName,
      count: briefs.length,
      topItems: briefs
        .sort((a, b) => b.createdAt - a.createdAt)
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

    const emailId = await resend.sendEmail(ctx, {
      to: user.email,
      from: `RSSBrief <onboarding@resend.dev>`,
      subject: `Your Weekly RSSBrief Digest (${weekStart} - ${weekEnd})`,
      text: createWeeklyDigestEmailText(digest),
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

export const updateFeedsAndGenerateBriefs = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log('Starting scheduled feed updates and brief generation...');

    const onboardedUsers = await ctx.runQuery(internal.briefs.getOnboardedUsers, {});

    if (onboardedUsers.length === 0) {
      console.log('No onboarded users found');
      return;
    }

    console.log(`Processing ${onboardedUsers.length} onboarded users`);

    const concurrencyLimit = pLimit(5);
    const userPromises = onboardedUsers.map((userId: Id<'users'>) =>
      concurrencyLimit(async () => {
        try {
          await ctx.runAction(internal.feeds.updateUserFeeds, { userId });

          const processedBriefs = await ctx.runAction(internal.briefs.updateUserBriefs, { userId });
          console.log(`User ${userId}: Updated feeds and generated ${processedBriefs.length} briefs`);
          return { userId, success: true, briefsCount: processedBriefs.length };
        } catch (error) {
          console.error(`Failed to process user ${userId}:`, error);
          return { userId, success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      }),
    );

    const results = await Promise.all(userPromises);
    const successfulUsers = results.filter((r) => r.success).length;
    const totalBriefs = results.reduce((sum: number, r) => sum + (r.briefsCount || 0), 0);

    console.log(
      `Feed update and brief generation completed: ${successfulUsers}/${onboardedUsers.length} users processed, ${totalBriefs} total briefs generated`,
    );
  },
});

export const getOnboardedUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const preferences = await ctx.db
      .query('preferences')
      .filter((q) => q.eq(q.field('onboarded'), true))
      .collect();

    return preferences.map((pref) => pref.userId);
  },
});

export const triggerFeedUpdateAndBriefGeneration = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = requireAuth(await getAuthUserId(ctx));

    console.log(`Manual trigger: Processing feeds and briefs for user ${userId}`);
    await ctx.scheduler.runAfter(0, internal.briefs.processUserFeedsAndBriefs, {
      userId,
    });

    return { success: true, message: 'Feed update and brief generation scheduled' };
  },
});

export const processUserFeedsAndBriefs = internalAction({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }): Promise<{ success: boolean; briefs: ProcessedFeedItem[] }> => {
    await ctx.runAction(internal.feeds.updateUserFeeds, { userId });
    console.log(`Feed update completed for user ${userId}`);

    const processedBriefs = await ctx.runAction(internal.briefs.updateUserBriefs, { userId });
    console.log(`Brief generation completed for user ${userId}: ${processedBriefs.length} briefs generated`);

    return { success: true, briefs: processedBriefs };
  },
});
