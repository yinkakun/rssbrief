import { internal } from './_generated/api';
import { cronJobs } from 'convex/server';
import { internalAction, internalQuery, internalMutation, mutation, query } from './_generated/server';
import { v } from 'convex/values';
import pLimit from 'p-limit';
import { Id } from './_generated/dataModel';
import { getAuthUserId } from '@convex-dev/auth/server';
import { requireAuth } from './utils';

const crons = cronJobs();

crons.interval('update feeds and generate briefs', { hours: 6 }, internal.briefs.updateFeedsAndGenerateBriefs);

crons.interval('generate weekly digests', { hours: 1 }, internal.briefs.generateScheduledWeeklyDigests);

export default crons;
