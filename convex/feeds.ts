import { v } from 'convex/values';
import { fromPromise } from 'neverthrow';
import { getAuthUserId } from '@convex-dev/auth/server';

import { internal } from './_generated/api';
import { safeParseRSS } from './rss_parser';
import { Doc, Id } from './_generated/dataModel';
import { TIME_CONSTANTS, requireAuth } from './utils';
import { query, internalQuery, internalMutation, internalAction } from './_generated/server';

export const getUserTopicFeeds = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query('topicFeeds')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
  },
});

export const getFeedById = internalQuery({
  args: { feedId: v.id('feeds') },
  handler: async (ctx, { feedId }) => {
    return await ctx.db.get(feedId);
  },
});

export const getExistingFeedItemByUrl = internalQuery({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    return await ctx.db
      .query('feedItems')
      .withIndex('by_url', (q) => q.eq('url', url))
      .first();
  },
});

export const insertFeedItem = internalMutation({
  args: {
    url: v.string(),
    feedId: v.id('feeds'),
    publishedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('feedItems', args);
  },
});

export const updateFeedTimestamp = internalMutation({
  args: {
    feedId: v.id('feeds'),
    updatedAt: v.number(),
  },
  handler: async (ctx, { feedId, updatedAt }) => {
    return await ctx.db.patch(feedId, { updatedAt });
  },
});

export const updateUserFeeds = internalAction({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const now = Date.now();
    const initialCutOffDay = now - TIME_CONSTANTS.ONE_WEEK;
    const userTopicFeeds = await ctx.runQuery(internal.feeds.getUserTopicFeeds, { userId });

    const userFeeds = userTopicFeeds;

    if (userFeeds.length === 0) {
      console.log(`No feeds found for user: ${userId}`);
      return;
    }

    const feedIds = userFeeds.map((tf) => tf.feedId);
    const feeds = await Promise.all(feedIds.map((feedId) => ctx.runQuery(internal.feeds.getFeedById, { feedId })));

    const validFeeds = feeds.filter((feed) => feed !== null && feed.url);

    console.log(`Processing ${validFeeds.length} feeds for user: ${userId}`);

    for (const feed of validFeeds) {
      if (!feed?.url) {
        console.warn(`Feed URL is missing for feed ID: ${feed?._id}`);
        continue;
      }

      const rssResult = await safeParseRSS(feed?.url);
      if (rssResult.isErr()) {
        console.warn(`Failed to parse RSS for ${feed.url}:`, rssResult.error);
        continue;
      }

      const { items } = rssResult.value;
      if (!items || items.length === 0) {
        console.warn(`No items found for feed: ${feed.url}`);
        continue;
      }

      const isFirstFetch = !feed.updatedAt;
      const cutoffDate = isFirstFetch ? initialCutOffDay : feed.updatedAt;

      const newFeedItems = [];
      for (const item of items) {
        if (!item.link) continue;

        let publishedAt = now;
        if (item.pubDate) {
          const parsed = new Date(item.pubDate).getTime();
          if (!isNaN(parsed)) publishedAt = parsed;
        }

        if (publishedAt < (cutoffDate || 0)) continue;

        const existingFeedItem = await ctx.runQuery(internal.feeds.getExistingFeedItemByUrl, {
          url: item.link,
        });

        if (existingFeedItem) {
          continue;
        }

        newFeedItems.push({
          publishedAt,
          url: item.link,
          feedId: feed._id,
        });
      }

      for (const feedItem of newFeedItems) {
        await ctx.runMutation(internal.feeds.insertFeedItem, feedItem);
      }

      await ctx.runMutation(internal.feeds.updateFeedTimestamp, {
        feedId: feed._id,
        updatedAt: now,
      });
    }

    console.log(`Feed update completed for user: ${userId}`);
  },
});
