import { internal } from './_generated/api';
import { cronJobs } from 'convex/server';

const crons = cronJobs();

crons.interval('generate weekly digests', { hours: 1 }, internal.briefs.generateScheduledWeeklyDigests);

export default crons;
