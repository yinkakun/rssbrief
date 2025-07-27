import { v } from 'convex/values';

import { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { internalQuery, internalMutation, MutationCtx, query, mutation } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';

export const getCuratedTopicByName = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    return await ctx.db
      .query('topics')
      .withIndex('by_user_and_name', (q) => q.eq('userId', null).eq('name', name))
      .unique();
  },
});

export const getFeedByUrl = internalQuery({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    return await ctx.db
      .query('feeds')
      .withIndex('by_url', (q) => q.eq('url', url))
      .unique();
  },
});

export const getTopicFeedRelation = internalQuery({
  args: { topicId: v.id('topics'), feedId: v.id('feeds') },
  handler: async (ctx, { topicId, feedId }) => {
    return await ctx.db
      .query('topicFeeds')
      .withIndex('by_topic_and_feed', (q) => q.eq('topicId', topicId).eq('feedId', feedId))
      .unique();
  },
});

const getOrCreateTopic = async (ctx: MutationCtx, topic: { name: string; tags: string[] }) => {
  const existing = await ctx.runQuery(internal.topics.getCuratedTopicByName, { name: topic.name });
  return (
    existing?._id ??
    (await ctx.db.insert('topics', {
      userId: null,
      name: topic.name,
      tags: topic.tags,
      createdAt: Date.now(),
    }))
  );
};

const getOrCreateFeed = async (ctx: MutationCtx, url: string, topicName: string): Promise<Id<'feeds'>> => {
  const existing = await ctx.runQuery(internal.topics.getFeedByUrl, { url });
  return (
    existing?._id ??
    (await ctx.db.insert('feeds', {
      url,
      title: topicName,
    }))
  );
};

const ensureTopicFeedRelation = async (ctx: MutationCtx, topicId: Id<'topics'>, feedId: Id<'feeds'>) => {
  const existing = await ctx.runQuery(internal.topics.getTopicFeedRelation, { topicId, feedId });
  if (!existing) {
    await ctx.db.insert('topicFeeds', {
      feedId,
      topicId,
      userId: null,
    });
  }
};

export const importCuratedTopics = internalMutation({
  args: {
    topics: v.array(
      v.object({
        name: v.string(),
        tags: v.array(v.string()),
        rssUrls: v.array(v.string()),
      }),
    ),
  },
  handler: async (ctx, { topics }) => {
    for (const topic of topics) {
      const topicId = await getOrCreateTopic(ctx, topic);

      await Promise.all(
        topic.rssUrls.map(async (url) => {
          const feedId = await getOrCreateFeed(ctx, url, topic.name);
          await ensureTopicFeedRelation(ctx, topicId, feedId);
        }),
      );
    }
  },
});

export const getAllCuratedTopics = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('topics')
      .withIndex('by_user', (q) => q.eq('userId', null))
      .collect();
  },
});

export const getUserTopics = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const userTopicFeeds = await ctx.db
      .query('topicFeeds')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    const uniqueTopicIds = [...new Set(userTopicFeeds.map((utf) => utf.topicId))];
    const topics = await Promise.all(uniqueTopicIds.map((id) => ctx.db.get(id)));

    return topics
      .filter((topic) => topic !== null)
      .map((topic) => ({
        id: topic._id,
        name: topic.name,
        tags: topic.tags,
      }));
  },
});

export const getUserTopicsPublic = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error('Not authenticated');
    }

    const userTopics = await ctx.db
      .query('topics')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    const topicsWithFeeds = await Promise.all(
      userTopics.map(async (topic) => {
        const feeds = await ctx.db
          .query('topicFeeds')
          .withIndex('by_user_and_topic', (q) => q.eq('userId', userId).eq('topicId', topic._id))
          .collect();

        const feedDetails = await Promise.all(
          feeds.map(async (tf) => {
            const feed = await ctx.db.get(tf.feedId);
            return feed ? { id: feed._id, url: feed.url, title: feed.title } : null;
          })
        );

        return {
          id: topic._id,
          name: topic.name,
          tags: topic.tags,
          createdAt: topic.createdAt,
          feeds: feedDetails.filter(Boolean),
        };
      })
    );

    return topicsWithFeeds;
  },
});

export const createUserTopic = mutation({
  args: {
    name: v.string(),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { name, tags = [] }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error('Not authenticated');
    }

    const existingTopic = await ctx.db
      .query('topics')
      .withIndex('by_user_and_name', (q) => q.eq('userId', userId).eq('name', name))
      .first();

    if (existingTopic) {
      throw new Error('Topic with this name already exists');
    }

    const topicId = await ctx.db.insert('topics', {
      name,
      tags,
      userId,
      createdAt: Date.now(),
    });

    return topicId;
  },
});

export const updateUserTopic = mutation({
  args: {
    topicId: v.id('topics'),
    name: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { topicId, name, tags }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error('Not authenticated');
    }

    const topic = await ctx.db.get(topicId);
    if (!topic || topic.userId !== userId) {
      throw new Error('Topic not found or access denied');
    }

    const updates: Partial<{ name: string; tags: string[] }> = {};
    if (name !== undefined) {
      const existingTopic = await ctx.db
        .query('topics')
        .withIndex('by_user_and_name', (q) => q.eq('userId', userId).eq('name', name))
        .first();

      if (existingTopic && existingTopic._id !== topicId) {
        throw new Error('Topic with this name already exists');
      }
      updates.name = name;
    }
    if (tags !== undefined) updates.tags = tags;

    await ctx.db.patch(topicId, updates);
    return topicId;
  },
});

export const deleteUserTopic = mutation({
  args: {
    topicId: v.id('topics'),
  },
  handler: async (ctx, { topicId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error('Not authenticated');
    }

    const topic = await ctx.db.get(topicId);
    if (!topic || topic.userId !== userId) {
      throw new Error('Topic not found or access denied');
    }

    const topicFeeds = await ctx.db
      .query('topicFeeds')
      .withIndex('by_user_and_topic', (q) => q.eq('userId', userId).eq('topicId', topicId))
      .collect();

    for (const topicFeed of topicFeeds) {
      await ctx.db.delete(topicFeed._id);
    }

    await ctx.db.delete(topicId);
    return topicId;
  },
});

export const addRSSUrlToTopic = mutation({
  args: {
    topicId: v.id('topics'),
    rssUrl: v.string(),
    feedTitle: v.optional(v.string()),
  },
  handler: async (ctx, { topicId, rssUrl, feedTitle }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error('Not authenticated');
    }

    const topic = await ctx.db.get(topicId);
    if (!topic || topic.userId !== userId) {
      throw new Error('Topic not found or access denied');
    }

    let feed = await ctx.db
      .query('feeds')
      .withIndex('by_url', (q) => q.eq('url', rssUrl))
      .first();

    if (!feed) {
      const feedId = await ctx.db.insert('feeds', {
        url: rssUrl,
        title: feedTitle || topic.name,
      });
      feed = await ctx.db.get(feedId);
    }

    if (!feed) {
      throw new Error('Failed to create or retrieve feed');
    }

    const existingRelation = await ctx.db
      .query('topicFeeds')
      .withIndex('by_user_and_topic', (q) => q.eq('userId', userId).eq('topicId', topicId))
      .filter((q) => q.eq(q.field('feedId'), feed._id))
      .first();

    if (existingRelation) {
      throw new Error('RSS feed already added to this topic');
    }

    const relationId = await ctx.db.insert('topicFeeds', {
      topicId,
      feedId: feed._id,
      userId,
    });

    return relationId;
  },
});

export const removeRSSUrlFromTopic = mutation({
  args: {
    topicId: v.id('topics'),
    feedId: v.id('feeds'),
  },
  handler: async (ctx, { topicId, feedId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error('Not authenticated');
    }

    const topic = await ctx.db.get(topicId);
    if (!topic || topic.userId !== userId) {
      throw new Error('Topic not found or access denied');
    }

    const relation = await ctx.db
      .query('topicFeeds')
      .withIndex('by_user_and_topic', (q) => q.eq('userId', userId).eq('topicId', topicId))
      .filter((q) => q.eq(q.field('feedId'), feedId))
      .first();

    if (!relation) {
      throw new Error('RSS feed not found in this topic');
    }

    await ctx.db.delete(relation._id);
    return relation._id;
  },
});

export const getTopicFeedsForUser = query({
  args: {
    topicId: v.id('topics'),
  },
  handler: async (ctx, { topicId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error('Not authenticated');
    }

    const topic = await ctx.db.get(topicId);
    if (!topic || topic.userId !== userId) {
      throw new Error('Topic not found or access denied');
    }

    const topicFeeds = await ctx.db
      .query('topicFeeds')
      .withIndex('by_user_and_topic', (q) => q.eq('userId', userId).eq('topicId', topicId))
      .collect();

    const feeds = await Promise.all(
      topicFeeds.map(async (tf) => {
        const feed = await ctx.db.get(tf.feedId);
        return feed ? {
          id: feed._id,
          url: feed.url,
          title: feed.title,
          updatedAt: feed.updatedAt,
        } : null;
      })
    );

    return feeds.filter(Boolean);
  },
});
