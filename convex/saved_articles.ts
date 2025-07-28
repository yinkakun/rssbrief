import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import { requireAuth } from './utils';

export const saveArticle = mutation({
  args: {
    articleId: v.id('articles'),
  },
  handler: async (ctx, { articleId }) => {
    const userId = requireAuth(await getAuthUserId(ctx));

    const article = await ctx.db.get(articleId);
    if (!article) {
      throw new Error('Article not found');
    }

    const existingSavedArticle = await ctx.db
      .query('savedArticles')
      .withIndex('by_user_and_article', (q) => q.eq('userId', userId).eq('articleId', articleId))
      .first();

    if (existingSavedArticle) {
      throw new Error('Article already saved');
    }

    const savedArticleId = await ctx.db.insert('savedArticles', {
      userId,
      articleId,
      savedAt: Date.now(),
    });

    return savedArticleId;
  },
});

export const unsaveArticle = mutation({
  args: {
    articleId: v.id('articles'),
  },
  handler: async (ctx, { articleId }) => {
    const userId = requireAuth(await getAuthUserId(ctx));

    const savedArticle = await ctx.db
      .query('savedArticles')
      .withIndex('by_user_and_article', (q) => q.eq('userId', userId).eq('articleId', articleId))
      .first();

    if (!savedArticle) {
      throw new Error('Article not saved');
    }

    await ctx.db.delete(savedArticle._id);
    return savedArticle._id;
  },
});

export const getSavedArticles = query({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 20, offset = 0 }) => {
    const userId = requireAuth(await getAuthUserId(ctx));

    const savedArticles = await ctx.db
      .query('savedArticles')
      .withIndex('by_user_and_saved_at', (q) => q.eq('userId', userId))
      .order('desc')
      .collect();

    const paginatedSavedArticles = savedArticles.slice(offset, offset + limit);

    const articlesWithDetails = await Promise.all(
      paginatedSavedArticles.map(async (savedArticle) => {
        const article = await ctx.db.get(savedArticle.articleId);
        if (!article) return null;

        const feed = await ctx.db.get(article.feedId);

        const topicFeed = await ctx.db
          .query('topicFeeds')
          .withIndex('by_feed', (q) => q.eq('feedId', article.feedId))
          .first();

        let topic = null;
        if (topicFeed) {
          topic = await ctx.db.get(topicFeed.topicId);
        }

        return {
          id: savedArticle._id,
          savedAt: savedArticle.savedAt,
          article: {
            id: article._id,
            title: article.title,
            url: article.url,
            content: article.content,
            publishedAt: article.publishedAt,
          },
          feed: feed ? {
            id: feed._id,
            title: feed.title,
            url: feed.url,
          } : null,
          topic: topic ? {
            id: topic._id,
            name: topic.name,
            tags: topic.tags,
          } : null,
        };
      })
    );

    return articlesWithDetails.filter(Boolean);
  },
});

export const isArticleSaved = query({
  args: {
    articleId: v.id('articles'),
  },
  handler: async (ctx, { articleId }) => {
    const userId = requireAuth(await getAuthUserId(ctx));

    const savedArticle = await ctx.db
      .query('savedArticles')
      .withIndex('by_user_and_article', (q) => q.eq('userId', userId).eq('articleId', articleId))
      .first();

    return savedArticle !== null;
  },
});

export const getSavedArticlesCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = requireAuth(await getAuthUserId(ctx));

    const savedArticles = await ctx.db
      .query('savedArticles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    return savedArticles.length;
  },
});

export const getSavedArticlesByTopic = query({
  args: {
    topicId: v.id('topics'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { topicId, limit = 20 }) => {
    const userId = requireAuth(await getAuthUserId(ctx));

    const topic = await ctx.db.get(topicId);
    if (!topic) {
      throw new Error('Topic not found');
    }

    const topicFeeds = await ctx.db
      .query('topicFeeds')
      .withIndex('by_topic', (q) => q.eq('topicId', topicId))
      .collect();

    const feedIds = topicFeeds.map(tf => tf.feedId);

    const savedArticles = await ctx.db
      .query('savedArticles')
      .withIndex('by_user_and_saved_at', (q) => q.eq('userId', userId))
      .order('desc')
      .collect();

    const topicSavedArticles = [];
    for (const savedArticle of savedArticles) {
      if (topicSavedArticles.length >= limit) break;

      const article = await ctx.db.get(savedArticle.articleId);
      if (article && feedIds.includes(article.feedId)) {
        const feed = await ctx.db.get(article.feedId);
        
        topicSavedArticles.push({
          id: savedArticle._id,
          savedAt: savedArticle.savedAt,
          article: {
            id: article._id,
            title: article.title,
            url: article.url,
            content: article.content,
            publishedAt: article.publishedAt,
          },
          feed: feed ? {
            id: feed._id,
            title: feed.title,
            url: feed.url,
          } : null,
          topic: {
            id: topic._id,
            name: topic.name,
            tags: topic.tags,
          },
        });
      }
    }

    return topicSavedArticles;
  },
});