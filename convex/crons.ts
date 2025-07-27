import { internal } from './_generated/api';
import { cronJobs } from 'convex/server';

const crons = cronJobs();

crons.interval('update feeds', { hours: 1 }, internal.feeds.updateAllFeeds);

export default crons;
