import { internal } from './_generated/api';
import { cronJobs } from 'convex/server';

const crons = cronJobs();

crons.interval('update feeds', { hours: 1 }, internal.feeds.updateAllFeeds);
crons.interval('generate scheduled briefs', { hours: 1 }, internal.briefs.generateScheduledBriefs);

export default crons;
