import { v } from 'convex/values';
import { defineSchema, defineTable } from 'convex/server';
import { authTables } from '@convex-dev/auth/server';

export default defineSchema({
  ...authTables,
  numbers: defineTable({
    value: v.number(),
  }),
  preferences: defineTable({
    name: v.string(),
    // timezone: v.string(),
    // hour: v.number(),
    // interval: v.string(),
    // dayOfWeek: v.number(),
    userId: v.id('users'),
  }).index('byUser', ['userId']),
});
