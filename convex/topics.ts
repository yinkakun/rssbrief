import { v } from 'convex/values';

import { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { internalQuery, internalMutation, MutationCtx } from './_generated/server';

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
