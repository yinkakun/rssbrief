import ky from 'ky';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { ok, fromPromise, fromThrowable } from 'neverthrow';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { Resend as ResendClient } from 'resend';
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
  ONE_MONTH: 30 * 24 * 60 * 60 * 1000,
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

export const safeRunAction = <T>(actionPromise: Promise<T>) =>
  fromPromise(actionPromise, (error) => ({
    step: 'action-execution',
    message: error instanceof Error ? error.message : String(error),
  }));

type PromptType = 'concise' | 'detailed';

export function createPrompt(text: string, type: PromptType): string {
  if (!text.trim()) {
    throw new Error('Input text cannot be empty');
  }

  const basePrompt = text.trim();

  switch (type) {
    case 'concise':
      return `${basePrompt}\n\nPlease provide a concise, focused response. Keep your answer brief and to the point, highlighting only the most essential information.`;

    case 'detailed':
      return `${basePrompt}\n\nPlease provide a comprehensive, detailed response. Include relevant context, examples, explanations, and thoroughly explore all important aspects of the topic.`;

    default:
      throw new Error(`Invalid prompt type: ${type}. Must be 'concise' or 'detailed'.`);
  }
}
