import { v } from 'convex/values';
import { query } from './_generated/server';
import { Doc, Id } from './_generated/dataModel';

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
