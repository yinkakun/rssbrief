import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';

export default defineSchema({
  ...authTables,

  preferences: defineTable({
    name: v.string(),
    userId: v.id('users'),
    onboarded: v.boolean(),
    translation: v.object({
      enabled: v.boolean(),
      language: v.optional(v.string()),
    }),
    brief: v.object({
      style: v.union(v.literal('concise'), v.literal('detailed')),
      schedule: v.object({
        hour: v.number(), // 0-23
        timezone: v.string(), // IANA tmz
        dayOfWeek: v.number(), // 0-6 (0 = Sunday)
      }),
    }),
    notifications: v.object({
      email: v.boolean(),
    }),
  })
    .index('by_user', ['userId'])
    .index('by_user_and_name', ['userId', 'name']),

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
});
