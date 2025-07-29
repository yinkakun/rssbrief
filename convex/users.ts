import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import { Doc } from './_generated/dataModel';
import { DEFAULT_PREFERENCES, requireAuth } from './utils';

export const getUserPreferences = query({
  args: {},
  handler: async (ctx) => {
    const userId = requireAuth(await getAuthUserId(ctx));

    const preferences = await ctx.db
      .query('preferences')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();

    return preferences;
  },
});

export const updateUserPreferences = mutation({
  args: {
    name: v.optional(v.string()),
    onboarded: v.optional(v.boolean()),
    briefSchedule: v.optional(
      v.object({
        hour: v.number(),
        dayOfWeek: v.number(),
        timezone: v.string(),
        translation: v.object({
          enabled: v.boolean(),
          language: v.optional(v.string()),
        }),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = requireAuth(await getAuthUserId(ctx));

    const existingPreferences = await ctx.db
      .query('preferences')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();

    if (existingPreferences) {
      const updatedFields: Partial<Doc<'preferences'>> = {};

      if (args.name !== undefined) updatedFields.name = args.name;
      if (args.onboarded !== undefined) updatedFields.onboarded = args.onboarded;
      if (args.briefSchedule !== undefined) updatedFields.briefSchedule = args.briefSchedule;

      await ctx.db.patch(existingPreferences._id, updatedFields);
      return existingPreferences._id;
    } else {
      const defaultPreferences = {
        name: args.name || '',
        userId,
        onboarded: args.onboarded || false,
        briefSchedule: args.briefSchedule || DEFAULT_PREFERENCES.briefSchedule,
      };

      return await ctx.db.insert('preferences', defaultPreferences);
    }
  },
});

export const resetUserPreferences = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = requireAuth(await getAuthUserId(ctx));

    const existingPreferences = await ctx.db
      .query('preferences')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();

    if (existingPreferences) {
      const defaultPreferences = {
        name: '',
        onboarded: false,
        briefSchedule: DEFAULT_PREFERENCES.briefSchedule,
      };

      await ctx.db.patch(existingPreferences._id, defaultPreferences);
      return existingPreferences._id;
    }

    return null;
  },
});

export const createUserPreferences = mutation({
  args: {
    name: v.string(),
    briefSchedule: v.optional(
      v.object({
        hour: v.number(),
        dayOfWeek: v.number(),
        timezone: v.string(),
        translation: v.object({
          enabled: v.boolean(),
          language: v.optional(v.string()),
        }),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = requireAuth(await getAuthUserId(ctx));

    const existingPreferences = await ctx.db
      .query('preferences')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();

    if (existingPreferences) {
      throw new Error('User preferences already exist');
    }

    const preferences = {
      name: args.name,
      userId,
      onboarded: false,
      briefSchedule: args.briefSchedule || DEFAULT_PREFERENCES.briefSchedule,
    };

    return await ctx.db.insert('preferences', preferences);
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    const preferences = await ctx.db
      .query('preferences')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();

    return {
      ...user,
      preferences: preferences || DEFAULT_PREFERENCES,
    };
  },
});
