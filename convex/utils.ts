import ky from 'ky';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { ok, fromPromise, fromThrowable } from 'neverthrow';
import { Id } from './_generated/dataModel';

export interface ProcessingError {
  step: string;
  message: string;
  url?: string;
}

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const AI_CONFIG = {
  maxTokens: 500,
  model: openai('gpt-4o-mini'),
} as const;

const httpClient = ky.create({
  timeout: 8000,
  retry: 2,
  headers: {
    'User-Agent': 'RSSBriefBot/1.0',
  },
});

export const safeGenerateText = (prompt: string) =>
  fromPromise(
    generateText({ prompt, ...AI_CONFIG }).then((r) => r.text),
    (error) => ({ message: `AI generation failed: ${error}`, step: 'ai-generation' }),
  );

interface ExtractedContentResponse {
  code: number;
  status: number;
  data: {
    title: string;
    description: string;
    url: string;
    content: string;
  };
}

export const safeExtractContent = (url: string) =>
  fromPromise(
    ky
      .create({
        timeout: 10000,
        headers: {
          'User-Agent': 'RSSBriefBot/1.0',
          accept: 'application/json',
        },
      })
      .get(`https://r.jina.ai/${encodeURIComponent(url)}`)
      .then((response) => response.json<ExtractedContentResponse>()),
    (error) => ({ message: `Content extraction failed: ${error}`, step: 'content-extraction' }),
  );

export const safeCreateURL = fromThrowable(
  (urlPath: string, baseUrl: string): string => {
    return new URL(urlPath, baseUrl).toString();
  },
  (e) => ({ message: `URL creation error: ${(e as Error).message}`, step: 'url-creation' }),
);

export const safeFetch = (url: string, shouldCache = false, cache?: Map<string, string>) => {
  if (shouldCache && cache?.has(url)) {
    return Promise.resolve(ok(cache.get(url)!));
  }

  return fromPromise(
    httpClient(url)
      .text()
      .then((content) => {
        if (shouldCache && cache) {
          cache.set(url, content);
        }
        return content;
      }),
    (e) => ({ message: `Fetch failed: ${(e as Error).message}`, step: 'fetch', url }),
  );
};

export const TIME_CONSTANTS = {
  ONE_MINUTE: 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000,
  ONE_WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;

export const limitArray = <T>(arr: T[], maxSize: number): T[] => arr.slice(0, maxSize);

export const slugify = (str: string): string =>
  str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const formatDateForBrief = (timestamp: number, timezone: string): string => {
  return new Date(timestamp).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  });
};

export interface BriefTopic {
  name: string;
  articles: Array<{
    title: string;
    url: string;
    summary: string;
    translation?: string;
  }>;
}

export interface BriefContent {
  topics: BriefTopic[];
  generatedAt: number;
  userTimezone: string;
}

export const formatBriefContent = (content: BriefContent): string => {
  const date = formatDateForBrief(content.generatedAt, content.userTimezone);

  let brief = `# Your Weekly RSS Brief - ${date}\n\n`;
  brief += `Here's what's been happening in your followed topics:\n\n`;

  for (const topic of content.topics) {
    brief += `## ${topic.name}\n\n`;

    for (const article of topic.articles) {
      brief += `### [${article.title}](${article.url})\n`;
      brief += `${article.summary}\n`;

      if (article.translation) {
        brief += `\n*Translation: ${article.translation}*\n`;
      }

      brief += `\n---\n\n`;
    }
  }

  brief += `\n*This brief was generated automatically based on your followed topics.*`;
  return brief;
};

interface calculateNextBriefTimeOpts {
  now?: Date;
  timezone: string;
  scheduledHour: number;
  scheduledDayOfWeek: number;
}

export const calculateNextBriefTime = (opts: calculateNextBriefTimeOpts) => {
  const { now = new Date(), scheduledHour, timezone, scheduledDayOfWeek } = opts;

  const currentTimeInUserTz = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const currentDayOfWeek = currentTimeInUserTz.getDay();
  const currentHour = currentTimeInUserTz.getHours();

  const nextBriefDate = new Date(currentTimeInUserTz);
  nextBriefDate.setHours(scheduledHour, 0, 0, 0);

  const daysUntilScheduled = (scheduledDayOfWeek - currentDayOfWeek + 7) % 7;

  if (daysUntilScheduled === 0) {
    if (currentHour >= scheduledHour) {
      nextBriefDate.setDate(nextBriefDate.getDate() + 7);
    }
  } else {
    nextBriefDate.setDate(nextBriefDate.getDate() + daysUntilScheduled);
  }

  const utcNextBrief = new Date(nextBriefDate.toLocaleString('en-US', { timeZone: 'UTC' }));

  return {
    nextBriefAt: utcNextBrief.getTime(),
    dayOfWeek: scheduledDayOfWeek,
    hour: scheduledHour,
    timezone: timezone,
    timeUntilNext: utcNextBrief.getTime() - now.getTime(),
  };
};

export const requireAuth = (userId: Id<'users'> | null) => {
  if (userId === null) {
    throw new Error('Not authenticated');
  }
  return userId;
};

export const BATCH_CONFIG = {
  DEFAULT_SIZE: 20,
  DELAY_BETWEEN_BATCHES: 100,
  MAX_CONCURRENCY: 10,
} as const;
