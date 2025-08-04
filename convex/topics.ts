import { ConvexError, v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { requireAuth } from './utils';
import { internal } from './_generated/api';
import { Id } from './_generated/dataModel';
import { internalQuery, internalMutation, MutationCtx, query, mutation } from './_generated/server';

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
    const feed = await ctx.db
      .query('feeds')
      .withIndex('by_url', (q) => q.eq('url', url))
      .unique();
    return feed;
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

const getOrCreateFeed = async (ctx: MutationCtx, url: string, _topicName: string): Promise<Id<'feeds'>> => {
  const existing = await ctx.runQuery(internal.topics.getFeedByUrl, { url });
  return (
    existing?._id ??
    (await ctx.db.insert('feeds', {
      url,
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

export const getCuratedTopics = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 100 }) => {
    const curatedTopics = await ctx.db
      .query('topics')
      .withIndex('by_user_and_name', (q) => q.eq('userId', null))
      .take(limit);

    return curatedTopics.map((topic) => ({
      id: topic._id,
      tags: topic.tags,
      name: topic.name,
      createdAt: topic.createdAt,
    }));
  },
});

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

export const getUserTopics = query({
  args: {},
  handler: async (ctx) => {
    const userId = requireAuth(await getAuthUserId(ctx));

    const allUserTopicFeeds = await ctx.db
      .query('topicFeeds')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    const userTopicIds = [...new Set(allUserTopicFeeds.map((tf) => tf.topicId))];

    const userCreatedTopics = await ctx.db
      .query('topics')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    const followedTopics = await Promise.all(
      userTopicIds.map(async (topicId) => {
        const topic = await ctx.db.get(topicId);
        return topic;
      }),
    );

    const allTopicsMap = new Map<Id<'topics'>, (typeof userCreatedTopics)[0]>();

    userCreatedTopics.forEach((topic) => {
      allTopicsMap.set(topic._id, topic);
    });

    followedTopics.forEach((topic) => {
      if (topic) {
        allTopicsMap.set(topic._id, topic);
      }
    });

    const allUserTopics = Array.from(allTopicsMap.values());

    // Group topic feeds by topicId for efficient lookup
    const feedsByTopicId = allUserTopicFeeds.reduce(
      (acc, tf) => {
        if (!acc[tf.topicId]) acc[tf.topicId] = [];
        acc[tf.topicId].push(tf);
        return acc;
      },
      {} as Record<string, typeof allUserTopicFeeds>,
    );

    const allFeedIds = [...new Set(allUserTopicFeeds.map((tf) => tf.feedId))];

    const feedsMap = new Map<Id<'feeds'>, { id: Id<'feeds'>; url: string }>();
    await Promise.all(
      allFeedIds.map(async (feedId) => {
        const feed = await ctx.db.get(feedId);
        if (feed) {
          feedsMap.set(feedId, { id: feed._id, url: feed.url });
        }
      }),
    );

    const topicsWithFeeds = allUserTopics.map((topic) => {
      const topicFeeds = feedsByTopicId[topic._id] || [];
      const feeds = topicFeeds.map((tf) => feedsMap.get(tf.feedId)).filter(Boolean);

      return {
        feeds,
        id: topic._id,
        name: topic.name,
        userId: topic.userId,
        createdAt: topic.createdAt,
        bookmarked: topic.bookmarked ?? false,
      };
    });

    return topicsWithFeeds;
  },
});

export const followTopic = mutation({
  args: {
    topicId: v.id('topics'),
  },
  handler: async (ctx, { topicId }) => {
    const userId = requireAuth(await getAuthUserId(ctx));

    const topic = await ctx.db.get(topicId);
    if (!topic) {
      throw new ConvexError('Topic not found');
    }

    const curatedTopicFeeds = await ctx.db
      .query('topicFeeds')
      .withIndex('by_topic', (q) => q.eq('topicId', topicId))
      .filter((q) => q.eq(q.field('userId'), null))
      .collect();

    const existingUserRelations = await ctx.db
      .query('topicFeeds')
      .withIndex('by_user_and_topic', (q) => q.eq('userId', userId).eq('topicId', topicId))
      .collect();

    const existingFeedIds = new Set(existingUserRelations.map((relation) => relation.feedId));

    const feedsToFollow = curatedTopicFeeds.filter((topicFeed) => !existingFeedIds.has(topicFeed.feedId));

    const relationPromises = feedsToFollow.map((topicFeed) =>
      ctx.db.insert('topicFeeds', {
        topicId,
        feedId: topicFeed.feedId,
        userId,
      }),
    );

    const relationIds = await Promise.all(relationPromises);
    return relationIds;
  },
});

export const unfollowTopic = mutation({
  args: {
    topicId: v.id('topics'),
  },
  handler: async (ctx, { topicId }) => {
    const userId = requireAuth(await getAuthUserId(ctx));

    const topic = await ctx.db.get(topicId);
    if (!topic) {
      throw new ConvexError('Topic not found'); // Fixed: Use ConvexError for consistency
    }

    const userTopicFeeds = await ctx.db
      .query('topicFeeds')
      .withIndex('by_user_and_topic', (q) => q.eq('userId', userId).eq('topicId', topicId))
      .collect();

    const deletePromises = userTopicFeeds.map((relation) => ctx.db.delete(relation._id));

    await Promise.all(deletePromises);

    return userTopicFeeds.map((relation) => relation._id);
  },
});

export const deleteUserTopic = mutation({
  args: {
    topicId: v.id('topics'),
  },
  handler: async (ctx, { topicId }) => {
    const userId = requireAuth(await getAuthUserId(ctx));
    const topic = await ctx.db.get(topicId);
    if (!topic) {
      throw new ConvexError('Topic not found');
    }

    if (topic.userId !== userId) {
      throw new ConvexError('You do not have permission to delete this topic');
    }

    const topicFeeds = await ctx.db
      .query('topicFeeds')
      .withIndex('by_topic', (q) => q.eq('topicId', topicId))
      .collect();

    const deleteFeedPromises = topicFeeds.map((tf) => ctx.db.delete(tf._id));
    await Promise.all(deleteFeedPromises);

    await ctx.db.delete(topicId);
    return topicId;
  },
});

export const bookmarkTopic = mutation({
  args: {
    topicId: v.id('topics'),
    bookmarked: v.boolean(),
  },
  handler: async (ctx, { topicId, bookmarked }) => {
    requireAuth(await getAuthUserId(ctx));
    const topic = await ctx.db.get(topicId);
    if (!topic) {
      throw new ConvexError('Topic not found');
    }

    await ctx.db.patch(topicId, {
      bookmarked,
    });

    return topicId;
  },
});

export const createUserTopic = mutation({
  args: {
    name: v.string(),
    rssUrls: v.array(v.string()),
  },
  handler: async (ctx, { name: _name, rssUrls }) => {
    const userId = requireAuth(await getAuthUserId(ctx));
    const name = _name.trim();

    if (!name) {
      throw new ConvexError('Topic name cannot be empty');
    }

    if (rssUrls.length === 0) {
      throw new ConvexError('At least one RSS feed URL is required');
    }

    const existingUserTopic = await ctx.db
      .query('topics')
      .withIndex('by_user_and_name', (q) => q.eq('userId', userId).eq('name', name))
      .unique();

    if (existingUserTopic) {
      throw new ConvexError('You already have a topic with this name');
    }

    const topicId = await ctx.db.insert('topics', {
      userId,
      tags: [],
      name: name.trim(),
      createdAt: Date.now(),
    });

    const feedPromises = rssUrls.map(async (url) => {
      const existingFeed = await ctx.runQuery(internal.topics.getFeedByUrl, { url: url });

      const feedId =
        existingFeed?._id ??
        (await ctx.db.insert('feeds', {
          url: url,
        }));

      await ctx.db.insert('topicFeeds', {
        topicId,
        feedId,
        userId,
      });

      return feedId;
    });

    await Promise.all(feedPromises);

    return topicId;
  },
});
