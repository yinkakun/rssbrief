import { v } from 'convex/values';
import { defineSchema, defineTable } from 'convex/server';
import { authTables } from '@convex-dev/auth/server';

export default defineSchema({
  ...authTables,

  preferences: defineTable({
    name: v.string(),
    userId: v.id('users'),
    onboarded: v.boolean(),
    briefSchedule: v.object({
      hour: v.number(), // 0-23
      dayOfWeek: v.number(), // 0-6 (Sunday-Saturday)
      timezone: v.string(),
      translation: v.object({
        enabled: v.boolean(),
        language: v.optional(v.string()),
      }),
    }),
  })
    .index('by_user', ['userId'])
    .index('by_brief_schedule', ['briefSchedule.dayOfWeek', 'briefSchedule.hour']),

  topics: defineTable({
    name: v.string(),
    createdAt: v.number(),
    tags: v.array(v.string()),
    userId: v.union(v.id('users'), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_user_and_name', ['userId', 'name']),

  feeds: defineTable({
    url: v.string(),
    title: v.string(),
    updatedAt: v.optional(v.number()),
  }).index('by_url', ['url']),

  topicFeeds: defineTable({
    feedId: v.id('feeds'),
    topicId: v.id('topics'),
    userId: v.union(v.id('users'), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_topic', ['topicId'])
    .index('by_feed', ['feedId'])
    .index('by_user_and_topic', ['userId', 'topicId'])
    .index('by_topic_and_feed', ['topicId', 'feedId']),

  articles: defineTable({
    url: v.string(),
    title: v.string(),
    content: v.string(),
    feedId: v.id('feeds'),
    publishedAt: v.number(),
  })
    .index('by_url', ['url'])
    .index('by_feed', ['feedId'])
    .index('by_feed_and_published', ['feedId', 'publishedAt']),

  briefs: defineTable({
    userId: v.id('users'),
    content: v.string(),
    sentAt: v.optional(v.number()),
    status: v.union(v.literal('pending'), v.literal('sent'), v.literal('failed')),
  })
    .index('by_user', ['userId'])
    .index('by_user_and_status', ['userId', 'status']),

  savedArticles: defineTable({
    savedAt: v.number(),
    userId: v.id('users'),
    articleId: v.id('articles'),
  })
    .index('by_user', ['userId'])
    .index('by_article', ['articleId'])
    .index('by_user_and_saved_at', ['userId', 'savedAt'])
    .index('by_user_and_article', ['userId', 'articleId']),
});
