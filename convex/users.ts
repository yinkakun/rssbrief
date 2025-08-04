import { v } from 'convex/values';
import { query, mutation, internalAction } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import { requireAuth } from './utils';
import { ConvexError } from 'convex/values';
import { api } from './_generated/api';
import { internal } from './_generated/api';
import { MutationCtx, QueryCtx } from './_generated/server';
import { Id, Doc } from './_generated/dataModel';
import { WithOptionalSystemFields } from 'convex/server';
import { internalQuery } from './_generated/server';
import { components } from './_generated/api';
import { Resend } from '@convex-dev/resend';

const resend: Resend = new Resend(components.resend, {});

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
      id: user._id,
      email: user.email,
      onboarded: preferences?.onboarded || false,
      preferences: {
        name: preferences?.name || '',
        notifications: preferences?.notifications,
        briefSchedule: preferences?.brief?.schedule,
        briefStyle: preferences?.brief?.style,
      },
    };
  },
});

export const getUserPreferences = (ctx: QueryCtx, userId: Id<'users'>) => {
  return ctx.db
    .query('preferences')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
};

export const getOrCreateUserPreferences = async (ctx: MutationCtx, userId: Id<'users'>) => {
  const existingPreferences = await ctx.db
    .query('preferences')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first();
  if (existingPreferences) return existingPreferences;

  const defaultPreferences: WithOptionalSystemFields<Doc<'preferences'>> = {
    userId,
    name: '',
    onboarded: false,
    brief: {
      schedule: {
        hour: 9, // Default to 9 AM
        dayOfWeek: 0, // Default to Sunday
        timezone: 'UTC',
      },
      style: 'concise',
    },
    notifications: {
      email: true,
    },
  };

  const newPreferenceId = await ctx.db.insert('preferences', defaultPreferences);
  return await ctx.db.get(newPreferenceId);
};

export const updateUserPreferences = mutation({
  args: {
    name: v.optional(v.string()),
    brief: v.optional(
      v.object({
        style: v.optional(v.union(v.literal('concise'), v.literal('detailed'))),
        schedule: v.optional(
          v.object({
            hour: v.optional(v.number()), // 0-23
            timezone: v.optional(v.string()), // IANA timezone
            dayOfWeek: v.optional(v.number()), // 0-6 (0 = Sunday)
          }),
        ),
      }),
    ),
    notifications: v.optional(
      v.object({
        email: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = requireAuth(await getAuthUserId(ctx));
    const existingPreferences = await getOrCreateUserPreferences(ctx, userId);

    if (!existingPreferences) {
      throw new Error('User preferences not found');
    }

    await ctx.db.patch(existingPreferences._id, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.brief && {
        brief: {
          style: args.brief.style ?? existingPreferences.brief.style,
          schedule: {
            hour: args.brief.schedule?.hour ?? existingPreferences.brief.schedule.hour,
            timezone: args.brief.schedule?.timezone ?? existingPreferences.brief.schedule.timezone,
            dayOfWeek: args.brief.schedule?.dayOfWeek ?? existingPreferences.brief.schedule.dayOfWeek,
          },
        },
      }),
      ...(args.notifications && {
        notifications: {
          email: args.notifications.email ?? existingPreferences.notifications.email,
        },
      }),
    });
  },
});

export const onboardUser = mutation({
  args: {
    name: v.string(),
    brief: v.object({
      style: v.union(v.literal('concise'), v.literal('detailed')),
      schedule: v.object({
        hour: v.number(), // 0-23
        timezone: v.string(), // IANA timezone
        dayOfWeek: v.number(), // 0-6 (0 = Sunday)
      }),
    }),
    topicsToFollow: v.array(v.id('topics')),
  },
  handler: async (ctx, args) => {
    const userId = requireAuth(await getAuthUserId(ctx));
    const existingPreferences = await getOrCreateUserPreferences(ctx, userId);

    if (!existingPreferences) {
      throw new ConvexError('User preferences not found');
    }

    await ctx.db.patch(existingPreferences._id, {
      name: args.name,
      onboarded: true,
      brief: args.brief,
      notifications: {
        email: true,
      },
    });

    for (const topicId of args.topicsToFollow) {
      ctx.runMutation(api.topics.followTopic, {
        topicId,
      });
    }

    await ctx.scheduler.runAfter(0, internal.users.processPostOnboardingTasks, {
      userId,
    });

    return existingPreferences._id;
  },
});

export const getWelcomeEmailData = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    const userTopicFeeds = await ctx.db
      .query('topicFeeds')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    const topicNames: string[] = [];
    for (const topicFeed of userTopicFeeds) {
      const topic = await ctx.db.get(topicFeed.topicId);
      if (topic) {
        topicNames.push(topic.name);
      }
    }

    return {
      email: user?.email,
      topicNames,
    };
  },
});

export const processPostOnboardingTasks = internalAction({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    console.log(`Processing post-onboarding tasks for user: ${userId}`);

    const userPreferences = await ctx.runQuery(internal.briefs.getUserPreferenceQuery, { userId });
    const welcomeData = await ctx.runQuery(internal.users.getWelcomeEmailData, { userId });

    if (!welcomeData.email || !userPreferences) {
      console.error(`User ${userId} missing email or preferences`);
      return;
    }

    const result = await ctx.runAction(internal.briefs.processUserFeedsAndBriefs, { userId });

    if (!result.success) {
      console.error(`Failed to process feeds and briefs for user ${userId}:`, result.error);
      return;
    }

    console.log(`Feed and brief processing completed for user: ${userId}, generated ${result.briefsCount} briefs`);

    // TODO - Send welcome email with brief content
    const emailId = await resend.sendEmail(ctx, {
      to: welcomeData.email,
      from: `RSSBrief <onboarding@resend.dev>`,
      subject: `🎉 Welcome to RSSBrief, ${userPreferences.name}! Here is your first brief!`,
      text: '',
    });

    if (emailId) {
      console.log(`Welcome email sent successfully to user ${userId}`);
    } else {
      console.error(`Failed to send welcome email to user ${userId}`);
    }
  },
});
