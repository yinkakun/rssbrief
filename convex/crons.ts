import { internal } from '@/ctx/api';
import { cronJobs } from 'convex/server';

const crons = cronJobs();

crons.interval('Generate and Send RSS Summary', { minutes: 100 }, internal.onboarding.generateAndSendRssSummary);

export default crons;
