import ky from 'ky';
import { generateText } from 'ai';
import { safeParseRSS } from './rss_parser';
import { createOpenAI } from '@ai-sdk/openai';
import { ok, err, Result, fromPromise, fromThrowable } from 'neverthrow';

interface ArticleResult {
  url: string;
  title: string;
  content: string;
  summary: string;
  translations: Array<{
    text: string;
    language: string;
  }>;
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

const safeGenerateText = (prompt: string) =>
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

const safeExtractContent = (url: string) =>
  fromPromise(
    ky
      .get(`https://r.jina.ai/${encodeURIComponent(url)}`, {
        timeout: 10000,
        headers: {
          accept: 'application/json',
        },
      })
      .then((response) => response.json<ExtractedContentResponse>()),
    (error) => ({ message: `Content extraction failed: ${error}`, step: 'content-extraction' }),
  );

const processArticleContent = async (url: string): Promise<Result<ArticleResult, ProcessingError>> => {
  const extractContentResult = await safeExtractContent(url);
  if (extractContentResult.isErr()) return err(extractContentResult.error);

  const extractedContent = extractContentResult.value.data;

  const summaryResult = await safeGenerateText(
    `Provide a concise 3-sentence summary of this article:\n\n${extractContentResult.value}`,
  );
  if (summaryResult.isErr()) return err(summaryResult.error);

  const translationResults = await Promise.all([
    safeGenerateText(`Translate to French, maintaining tone and meaning:\n\n${summaryResult.value}`),
    safeGenerateText(`Translate to Spanish, maintaining tone and meaning:\n\n${summaryResult.value}`),
  ]);

  const [frenchResult, spanishResult] = translationResults;

  if (frenchResult.isErr()) return err(frenchResult.error);
  if (spanishResult.isErr()) return err(spanishResult.error);

  return ok({
    url,
    title: extractedContent.title,
    content: extractedContent.content,
    summary: summaryResult.value,
    translations: [
      { text: frenchResult.value, language: 'fr' },
      { text: spanishResult.value, language: 'es' },
    ],
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

const processRSSFeed = async (feedUrl: string): Promise<Result<ArticleResult, ProcessingError>> => {
  const urlResult = await getLatestFeedItem(feedUrl);
  if (urlResult.isErr()) return err(urlResult.error);

  return processArticleContent(urlResult.value);
};

(async () => {
  const result = await processRSSFeed('https://www.hellbox.co.uk/feed/');

  result.match(
    (article) => {
      console.log('Success:', article.title);
      console.log('Summary:', article.summary);
      console.log('Translations:', article.translations);
      process.exit(0);
    },
    (error) => {
      console.log(`Error in ${error.step}: ${error.message}`);
      process.exit(1);
    },
  );
})();
