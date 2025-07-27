import { v } from 'convex/values';
import { query, internalQuery, internalMutation, internalAction } from './_generated/server';
import { Doc, Id } from './_generated/dataModel';
import { safeParseRSS } from './rss_parser';
import { internal } from './_generated/api';

export const getLatestArticles = query({
  args: { userId: v.id('users'), limit: v.optional(v.number()), topicId: v.optional(v.id('topics')) },
  handler: async (ctx, { userId, limit = 40, topicId }) => {
    let userTopicsQuery = ctx.db.query('topicFeeds').withIndex('by_user', (q) => q.eq('userId', userId));
    if (topicId) {
      userTopicsQuery = userTopicsQuery.filter((q) => q.eq(q.field('topicId'), topicId));
    }

    const userTopics = await userTopicsQuery.collect();

    if (userTopics.length === 0) {
      return [];
    }

    const feedIds = userTopics.map((t) => t.feedId);
    const articlesPerFeed = Math.max(1, Math.ceil(limit / feedIds.length));
    const allArticlePromises = feedIds.map((feedId) =>
      ctx.db
        .query('articles')
        .withIndex('by_feed', (q) => q.eq('feedId', feedId))
        .order('desc')
        .take(articlesPerFeed),
    );
    const resolvedArticlePromises = await Promise.all(allArticlePromises);

    const articles = resolvedArticlePromises
      .flat()
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, limit);

    const feedMap = new Map<Id<'feeds'>, Doc<'feeds'>>();
    const topicMap = new Map<Id<'topics'>, Doc<'topics'>>();
    const feedToTopicMap = new Map<Id<'feeds'>, Id<'topics'>>();

    userTopics.forEach((ut) => {
      feedToTopicMap.set(ut.feedId, ut.topicId);
    });

    const uniqueFeedIds = [...new Set(articles.map((a) => a.feedId))];
    const uniqueTopicIds = [...new Set(userTopics.map((ut) => ut.topicId))];

    const [feeds, topics] = await Promise.all([
      Promise.all(uniqueFeedIds.map((id) => ctx.db.get(id))),
      Promise.all(uniqueTopicIds.map((id) => ctx.db.get(id))),
    ]);

    feeds.forEach((feed) => {
      if (feed) feedMap.set(feed._id, feed);
    });

    topics.forEach((topic) => {
      if (topic) topicMap.set(topic._id, topic);
    });

    const detailedArticles = articles.map((article) => {
      const feed = feedMap.get(article.feedId);
      const topicId = feedToTopicMap.get(article.feedId);
      const topic = topicId ? topicMap.get(topicId) : null;

      return {
        ...article,
        feed: feed
          ? {
              url: feed.url,
              title: feed.title,
            }
          : null,
        topic: topic
          ? {
              id: topic._id,
              name: topic.name,
              tags: topic.tags,
            }
          : null,
      };
    });

    return detailedArticles;
  },
});

export const getTopicFeeds = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('topicFeeds').collect();
  },
});

export const getFeedById = internalQuery({
  args: { feedId: v.id('feeds') },
  handler: async (ctx, { feedId }) => {
    return await ctx.db.get(feedId);
  },
});

export const getExistingArticleByUrl = internalQuery({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    return await ctx.db
      .query('articles')
      .withIndex('by_url', (q) => q.eq('url', url))
      .first();
  },
});

export const insertArticle = internalMutation({
  args: {
    publishedAt: v.number(),
    url: v.string(),
    feedId: v.id('feeds'),
    title: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('articles', args);
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

export const updateAllFeeds = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const topicFeeds = await ctx.runQuery(internal.feeds.getTopicFeeds);
    const feedFollowCounts = new Map<Id<'feeds'>, number>();

    for (const topicFeed of topicFeeds) {
      if (topicFeed.userId) {
        const count = feedFollowCounts.get(topicFeed.feedId) || 0;
        feedFollowCounts.set(topicFeed.feedId, count + 1);
      }
    }

    const feedsWithFollows = Array.from(feedFollowCounts.keys());
    if (feedsWithFollows.length === 0) {
      console.log('No feeds with user follows found');
      return;
    }

    const feeds = await Promise.all(
      feedsWithFollows.map((feedId) => ctx.runQuery(internal.feeds.getFeedById, { feedId })),
    );

    const validFeeds = feeds.filter(Boolean) as Doc<'feeds'>[];

    validFeeds.sort((a, b) => {
      const aFollows = feedFollowCounts.get(a._id) || 0;
      const bFollows = feedFollowCounts.get(b._id) || 0;
      if (aFollows !== bFollows) return bFollows - aFollows;
      return (a.updatedAt || 0) - (b.updatedAt || 0);
    });

    console.log(`Processing ${validFeeds.length} feeds with follows`);

    for (const feed of validFeeds) {
      try {
        console.log(`Processing feed: ${feed.title} (${feed.url})`);

        const rssResult = await safeParseRSS(feed.url);
        if (rssResult.isErr()) {
          console.error(`Failed to parse RSS for ${feed.url}:`, rssResult.error);
          continue;
        }

        const { items } = rssResult.value;
        if (!items || items.length === 0) {
          console.log(`No items found for feed: ${feed.url}`);
          continue;
        }

        const isFirstFetch = !feed.updatedAt;
        const cutoffDate = isFirstFetch ? sevenDaysAgo : feed.updatedAt;

        const newArticles = [];
        for (const item of items) {
          if (!item.link) continue;

          let publishedAt = now;
          if (item.pubDate) {
            const parsed = new Date(item.pubDate).getTime();
            if (!isNaN(parsed)) publishedAt = parsed;
          }

          if (publishedAt < (cutoffDate || 0)) continue;

          const existing = await ctx.runQuery(internal.feeds.getExistingArticleByUrl, {
            url: item.link,
          });

          if (existing) {
            console.log(`Article already exists: ${item.link}`);
            continue;
          }

          try {
            const response = await fetch(`https://r.jina.ai/${encodeURIComponent(item.link)}`, {
              headers: { accept: 'application/json' },
              signal: AbortSignal.timeout(10000),
            });

            if (!response.ok) {
              console.error(`Content extraction failed for ${item.link}: ${response.status}`);
              continue;
            }

            const data = (await response.json()) as {
              data: { title: string; content: string };
            };

            newArticles.push({
              publishedAt,
              url: item.link,
              feedId: feed._id,
              title: data.data.title,
              content: data.data.content,
            });
          } catch (error) {
            console.error(`Error extracting content for ${item.link}:`, error);
            continue;
          }
        }

        for (const article of newArticles) {
          await ctx.runMutation(internal.feeds.insertArticle, article);
        }

        await ctx.runMutation(internal.feeds.updateFeedTimestamp, {
          feedId: feed._id,
          updatedAt: now,
        });

        console.log(`Added ${newArticles.length} new articles for feed: ${feed.title}`);
      } catch (error) {
        console.error(`Error processing feed ${feed.url}:`, error);
      }
    }

    console.log('Feed update completed');
  },
});
