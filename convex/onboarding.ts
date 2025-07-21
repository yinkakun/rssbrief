import { v } from 'convex/values';
import { query, mutation } from '@/ctx/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import { internalAction } from '@/ctx/server';

// throw new ConvexError({
//   message: 'My fancy error message',
//   code: 123,
//   severity: 'high',
// });

export const updateUserPreferences = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('User not authenticated');
    }

    await ctx.db.insert('preferences', {
      name: args.name,
      userId,
    });

    console.log('Updated preferences for user:', userId);

    // TODO: remove return value
    return true;
  },
});

export const getUserPreferences = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const preferences = await ctx.db
      .query('preferences')
      .withIndex('byUser', (q) => q.eq('userId', userId))
      .collect();
    return preferences;
  },
});

export const generateAndSendRssSummary = internalAction({
  args: {},
  handler: async (ctx) => {
    // This is a placeholder for the actual implementation
    // You would typically fetch RSS feeds, generate summaries, and send emails here
    console.log('Generating and sending RSS summary...');

    // Simulate some processing
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log('RSS summary generated and sent successfully');
  },
});
