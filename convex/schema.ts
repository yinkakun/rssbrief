import { v } from 'convex/values';
import { defineSchema, defineTable } from 'convex/server';
import { authTables } from '@convex-dev/auth/server';

export default defineSchema({
  ...authTables,

  systemCategories: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
  }).index('by_slug', ['slug']),

  systemFeeds: defineTable({
    url: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    categoryId: v.id('systemCategories'),
    isActive: v.optional(v.boolean()),
    lastFetched: v.optional(v.number()),
  })
    .index('byCategory', ['categoryId'])
    .index('byActive', ['isActive']),

  userFeeds: defineTable({
    feedUrl: v.string(),
    userId: v.id('users'),
    title: v.string(),
    isActive: v.boolean(),
    collectionId: v.optional(v.id('userCollections')),
    addedAt: v.number(),
    lastSyncedAt: v.optional(v.number()),
  })
    .index('byUser', ['userId'])
    .index('byCollection', ['collectionId'])
    .index('byUserActive', ['userId', 'isActive'])
    .index('byUserFeed', ['userId', 'feedUrl']),

  userCollections: defineTable({
    name: v.string(),
    userId: v.id('users'),
    createdAt: v.number(),
  })
    .index('byUser', ['userId'])
    .index('byUserCreated', ['userId', 'createdAt']),

  userPreferences: defineTable({
    userId: v.id('users'),
    name: v.optional(v.string()),
    isOnboarded: v.optional(v.boolean()),

    aiTranslationEnabled: v.boolean(),
    aiTranslationLanguage: v.string(),

    aiSummarizationEnabled: v.boolean(),
    aiSummarizationStyle: v.union(v.literal('concise'), v.literal('detailed'), v.literal('balanced')),

    notificationHour: v.number(),
    notificationTimezone: v.string(),
    emailNotificationsEnabled: v.boolean(),
    notificationFrequency: v.union(v.literal('daily'), v.literal('weekly'), v.literal('monthly')),

    updatedAt: v.number(),
  }).index('byUser', ['userId']),

  feedItems: defineTable({
    link: v.string(),
    title: v.string(),
    feedUrl: v.string(),
    originalContent: v.string(),

    summary: v.optional(v.string()),
    translatedSummary: v.optional(v.string()),
    translatedLanguage: v.optional(v.string()),

    publishedAt: v.number(),
    processedAt: v.number(),

    contentHash: v.optional(v.string()),
  })
    .index('byFeed', ['feedUrl'])
    .index('byFeedPublished', ['feedUrl', 'publishedAt'])
    .index('byPublished', ['publishedAt'])
    .index('byProcessed', ['processedAt']),

  notificationBatches: defineTable({
    userId: v.id('users'),
    scheduledFor: v.number(),
    itemIds: v.array(v.id('feedItems')),

    sentAt: v.optional(v.number()),
    deliveryMethod: v.union(v.literal('email')),
    status: v.union(v.literal('pending'), v.literal('sent'), v.literal('failed')),

    retryCount: v.optional(v.number()),
    failureReason: v.optional(v.string()),

    createdAt: v.number(),
  })
    .index('byUser', ['userId'])
    .index('byUserScheduled', ['userId', 'scheduledFor'])
    .index('byScheduledStatus', ['scheduledFor', 'status'])
    .index('byStatus', ['status']),

  // Test
  numbers: defineTable({
    value: v.number(),
  }),
});

// TODO: Add feed tagging feature

// Architecture Notes:
// 1. RSS items get fetched → stored in feedItems with AI processing
// 2. Scheduler creates notificationBatches based on userPreferences
// 3. Delivery system processes batches and updates status
// 4. Use compound indexes for common query patterns
// 5. Consider archiving old feedItems after 90+ days for performance
