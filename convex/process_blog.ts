import ky from 'ky';
import { JSDOM } from 'jsdom';
import { generateText } from 'ai';
import { safeParseRSS } from './rss_parser';
import { createOpenAI } from '@ai-sdk/openai';
import { ok, err, Result, fromPromise, fromThrowable } from 'neverthrow';
import { Readability, isProbablyReaderable } from '@mozilla/readability';

interface ArticleResult {
  url: string;
  title: string;
  content: string;
  summary: string;
  translations: {
    french: string;
    spanish: string;
  };
}

interface ProcessingError {
  step: string;
  message: string;
}

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const AI_CONFIG = {
  maxTokens: 500,
  model: openai('gpt-4o-mini'),
} as const;

const safeFetchText = (url: string) =>
  fromPromise(
    ky.get(url, { timeout: 10000 }).then((r) => r.text()),
    (error) => ({ message: `Failed to fetch URL: ${error}`, step: 'fetch' }),
  );

const safeExtractContent = fromThrowable(
  (html: string) => {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    if (!isProbablyReaderable(document)) {
      throw new Error('Content is not machine-readable');
    }

    const readableContent = new Readability(document).parse();
    if (!readableContent) {
      throw new Error('Failed to parse article content');
    }

    console.log(`${JSON.stringify(readableContent, null, 2)}`);

    return {
      title: readableContent.title || 'Untitled',
      content: readableContent.textContent || '',
    };
  },
  (error) => ({ message: `HTML parsing failed: ${error}`, step: 'html-parse' }),
);

const safeGenerateText = (prompt: string) =>
  fromPromise(
    generateText({ prompt, ...AI_CONFIG }).then((r) => r.text),
    (error) => ({ message: `AI generation failed: ${error}`, step: 'ai-generation' }),
  );

const processArticleContent = async (url: string): Promise<Result<ArticleResult, ProcessingError>> => {
  const htmlResult = await safeFetchText(url);
  if (htmlResult.isErr()) return err(htmlResult.error);

  const contentResult = safeExtractContent(htmlResult.value);
  if (contentResult.isErr()) return err(contentResult.error);

  const { title, content } = contentResult.value;

  const summaryResult = await safeGenerateText(`Provide a concise 3-sentence summary of this article:\n\n${content}`);
  if (summaryResult.isErr()) return err(summaryResult.error);

  const summary = summaryResult.value;

  const translationResults = await Promise.all([
    safeGenerateText(`Translate to French, maintaining tone and meaning:\n\n${summary}`),
    safeGenerateText(`Translate to Spanish, maintaining tone and meaning:\n\n${summary}`),
  ]);

  const [frenchResult, spanishResult] = translationResults;
  if (frenchResult.isErr()) return err(frenchResult.error);
  if (spanishResult.isErr()) return err(spanishResult.error);

  return ok({
    url,
    title,
    content,
    summary,
    translations: {
      french: frenchResult.value,
      spanish: spanishResult.value,
    },
  });
};

const getLatestFeedItem = async (feedUrl: string) => {
  const itemsResult = await safeParseRSS(feedUrl);
  if (itemsResult.isErr()) return err(itemsResult.error);

  const items = itemsResult.value;
  const latestItem = items.items[0];

  if (!latestItem?.link) {
    return err({ message: 'No valid article link found', step: 'validation' });
  }

  return ok(latestItem.link);
};

export const processRSSFeed = async (feedUrl: string): Promise<Result<ArticleResult, ProcessingError>> => {
  const urlResult = await getLatestFeedItem(feedUrl);
  if (urlResult.isErr()) return err(urlResult.error);

  return processArticleContent(urlResult.value);
};

(async () => {
  const result = await processRSSFeed('https://lardel.li/feeds/all.rss.xml');

  result.match(
    (article) => {
      console.log('Success:', article.title);
      console.log('Summary:', article.summary);
      process.exit(0);
    },
    (error) => {
      console.log(`Error in ${error.step}: ${error.message}`);
      process.exit(1);
    },
  );
})();
