import pLimit from 'p-limit';
import * as cheerio from 'cheerio';
import { ok, err, Result, fromThrowable } from 'neverthrow';

import { internal } from './_generated/api';
import { safeParseRSS } from './rss_parser';
import { internalAction } from './_generated/server';
import { safeFetch, safeCreateURL, limitArray, delay, slugify, BATCH_CONFIG } from './utils';

interface CategoryRss {
  name: string;
  rssFeedUrl: string;
  pathSegments: string[];
}

interface BlogRssLink {
  url: string;
  categoryName: string;
  pathSegments: string[];
}

interface CrawlError {
  step: string;
  url?: string;
  message: string;
}

interface CrawlResult {
  [categoryName: string]: {
    name: string;
    pathSegments: string[];
    blogRssLinks: string[];
  };
}

const CONFIG = {
  BATCH_SIZE: BATCH_CONFIG.DEFAULT_SIZE,
  RETRY_ATTEMPTS: 2,
  REQUEST_TIMEOUT: 8000,
  MAX_BLOGS_PER_CATEGORY: 5,
  MAX_RSS_ITEMS_TO_PARSE: 5,
  DELAY_BETWEEN_BATCHES: BATCH_CONFIG.DELAY_BETWEEN_BATCHES,
  MAX_CATEGORIES_TO_PROCESS: 50,
} as const;

const CONCURRENCY_LIMIT = pLimit(100);

const urlCache = new Map<string, string>();
const contentCache = new Map<string, string>();

const safeParseHTML = fromThrowable(
  (htmlContent: string) => cheerio.load(htmlContent),
  (e) => ({ message: `HTML parse error: ${(e as Error).message}`, step: 'html-parse' }),
);

const fetchContent = (url: string, shouldCache = true) => {
  return safeFetch(url, shouldCache, contentCache);
};

const parseRssFeedFromUrl = async (feedUrl: string): Promise<Result<string[], CrawlError>> => {
  return safeParseRSS(feedUrl).then((result) => {
    if (result.isErr()) return err(result.error);

    const feed = result.value;
    const blogUrls = limitArray(feed.items, CONFIG.MAX_RSS_ITEMS_TO_PARSE)
      .map((item) => item.link)
      .filter(Boolean)
      .filter((url): url is string => typeof url === 'string' && url.startsWith('http'));

    return ok(blogUrls);
  });
};

const extractCategoryUrlsFromSitemap = async (): Promise<Result<string[], CrawlError>> => {
  return fetchContent('https://ooh.directory/sitemap-categories.xml').then((result) => {
    if (result.isErr()) return err(result.error);

    return safeParseHTML(result.value).andThen(($) => {
      const urls = $('url loc')
        .map((_, el) => $(el).text())
        .get()
        .filter((url: string) => url?.includes('/blogs/') && !url.endsWith('/blogs/'))
        .filter(Boolean);

      if (urls.length === 0) {
        return err({ message: 'No category URLs found in sitemap', step: 'sitemap-parse' });
      }

      return ok(urls);
    });
  });
};

const extractCategoryRssFeed = async (categoryUrl: string): Promise<Result<CategoryRss, CrawlError>> => {
  const htmlResult = await fetchContent(categoryUrl);
  if (htmlResult.isErr()) return err(htmlResult.error);

  return safeParseHTML(htmlResult.value).andThen(($) => {
    const title = $('title').text().trim();
    const categoryName = title
      .replace(/^Blogs about /, '')
      .replace(/\s*\(.*?\)\s*$/, '')
      .trim();

    const rssFeedHref = $('link[rel="alternate"][type="application/rss+xml"]').attr('href');

    if (!categoryName || !rssFeedHref) {
      return err({
        message: 'Missing category name or RSS feed',
        step: 'category-parse',
        url: categoryUrl,
      });
    }

    const rssFeedUrlResult = safeCreateURL(rssFeedHref, 'https://ooh.directory');
    if (rssFeedUrlResult.isErr()) return err(rssFeedUrlResult.error);

    const pathSegments = categoryUrl.replace('https://ooh.directory/blogs/', '').split('/').filter(Boolean);

    return ok({
      pathSegments,
      url: categoryUrl,
      name: categoryName,
      rssFeedUrl: rssFeedUrlResult.value,
    });
  });
};

const extractRssFeedsFromCategories = async (categoryUrls: string[]): Promise<Result<CategoryRss[], CrawlError>> => {
  const categories: CategoryRss[] = [];
  let errorCount = 0;

  for (let i = 0; i < categoryUrls.length; i += CONFIG.BATCH_SIZE) {
    const batch = categoryUrls.slice(i, i + CONFIG.BATCH_SIZE);

    const results = await Promise.all(
      batch.map((url) =>
        CONCURRENCY_LIMIT(async () => {
          const result = await extractCategoryRssFeed(url);
          if (result.isErr()) {
            console.warn(`Error processing category ${url}: ${result.error.message}`);
            errorCount++;
            return null;
          }
          return result.value;
        }),
      ),
    );

    categories.push(...results.filter((item): item is CategoryRss => item !== null));

    if (i + CONFIG.BATCH_SIZE < categoryUrls.length) {
      await delay(CONFIG.DELAY_BETWEEN_BATCHES);
    }
  }

  console.log(`Extracted ${categories.length} categories, ${errorCount} errors`);
  return ok(categories);
};

const extractBlogUrls = async (categories: CategoryRss[]): Promise<Result<BlogRssLink[], CrawlError>> => {
  const blogUrls: BlogRssLink[] = [];

  for (let i = 0; i < categories.length; i += CONFIG.BATCH_SIZE) {
    const batch = categories.slice(i, i + CONFIG.BATCH_SIZE);

    const results = await Promise.all(
      batch.map((category) =>
        CONCURRENCY_LIMIT(async () => {
          const urlsResult = await parseRssFeedFromUrl(category.rssFeedUrl);
          if (urlsResult.isErr()) return [];

          return limitArray(urlsResult.value, CONFIG.MAX_BLOGS_PER_CATEGORY).map((url) => ({
            url,
            categoryName: category.name,
            pathSegments: category.pathSegments,
          }));
        }),
      ),
    );

    blogUrls.push(...results.flat());

    if (i + CONFIG.BATCH_SIZE < categories.length) {
      await delay(CONFIG.DELAY_BETWEEN_BATCHES * 2);
    }
  }

  return ok(blogUrls);
};

const extractBlogRssFeed = (htmlContent: string, blogUrl: string): Result<string, CrawlError> => {
  return safeParseHTML(htmlContent).andThen(($) => {
    const selectors = [
      'link[rel="alternate"][type="application/rss+xml"]',
      'link[rel="alternate"][type="application/atom+xml"]',
      'link[type="application/rss+xml"]',
      'link[type="application/atom+xml"]',
    ];

    for (const selector of selectors) {
      const href = $(selector).first().attr('href');
      if (href) {
        if (href.startsWith('http')) return ok(href);

        const absoluteUrlResult = safeCreateURL(href, blogUrl);
        if (absoluteUrlResult.isOk()) return ok(absoluteUrlResult.value);
      }
    }

    return err({
      message: 'No RSS feed found',
      step: 'rss-extraction',
      url: blogUrl,
    });
  });
};

const extractRssFeedsFromBlogs = async (blogUrls: BlogRssLink[]): Promise<Result<BlogRssLink[], CrawlError>> => {
  const uniqueBlogs = new Map<
    string,
    {
      url: string;
      categories: Array<{ name: string; pathSegments: string[] }>;
    }
  >();

  blogUrls.forEach((blog) => {
    if (uniqueBlogs.has(blog.url)) {
      uniqueBlogs.get(blog.url)!.categories.push({
        name: blog.categoryName,
        pathSegments: blog.pathSegments,
      });
    } else {
      uniqueBlogs.set(blog.url, {
        url: blog.url,
        categories: [{ name: blog.categoryName, pathSegments: blog.pathSegments }],
      });
    }
  });

  const blogs = Array.from(uniqueBlogs.values());
  const blogRssLinks: BlogRssLink[] = [];

  console.log(`Processing ${blogs.length} unique blogs (deduplicated from ${blogUrls.length})`);

  for (let i = 0; i < blogs.length; i += CONFIG.BATCH_SIZE) {
    const batch = blogs.slice(i, i + CONFIG.BATCH_SIZE);

    const results = await Promise.all(
      batch.map((blog) =>
        CONCURRENCY_LIMIT(async () => {
          const pageResult = await fetchContent(blog.url, false);
          if (pageResult.isErr()) return null;

          const rssFeedResult = extractBlogRssFeed(pageResult.value, blog.url);
          if (rssFeedResult.isErr()) return null;

          return blog.categories.map((category) => ({
            url: rssFeedResult.value,
            categoryName: category.name,
            pathSegments: category.pathSegments,
          }));
        }),
      ),
    );

    const validResults = results.filter((item): item is BlogRssLink[] => item !== null);
    blogRssLinks.push(...validResults.flat());

    if (i + CONFIG.BATCH_SIZE < blogs.length) {
      await delay(CONFIG.DELAY_BETWEEN_BATCHES * 3);
    }
  }

  return ok(blogRssLinks);
};

const crawlRssFeeds = async (): Promise<Result<CrawlResult, CrawlError>> => {
  console.log('Starting RSS feed crawling...');
  const startTime = Date.now();

  // Get category page URLs
  const categoryUrlsResult = await extractCategoryUrlsFromSitemap();
  if (categoryUrlsResult.isErr()) return err(categoryUrlsResult.error);

  const categoryUrls = limitArray(categoryUrlsResult.value, CONFIG.MAX_CATEGORIES_TO_PROCESS);

  console.log(`Found ${categoryUrlsResult.value.length} category URLs, Processing up to ${categoryUrls.length}`);

  // Extract RSS feeds from categories
  const categoriesResult = await extractRssFeedsFromCategories(categoryUrls);
  if (categoriesResult.isErr()) return err(categoriesResult.error);

  console.log(`Processed ${categoriesResult.value.length} categories with RSS feeds`);

  // Extract blog URLs from category RSS feeds
  const blogUrlsResult = await extractBlogUrls(categoriesResult.value);
  if (blogUrlsResult.isErr()) return err(blogUrlsResult.error);

  console.log(`Extracted ${blogUrlsResult.value.length} blog URLs`);

  //  Extract RSS links from blog pages
  const blogRssLinksResult = await extractRssFeedsFromBlogs(blogUrlsResult.value);
  if (blogRssLinksResult.isErr()) return err(blogRssLinksResult.error);

  console.log(`Found ${blogRssLinksResult.value.length} blog RSS links`);

  // Categorize results
  const categorizedResults: CrawlResult = {};

  blogRssLinksResult.value.forEach((link) => {
    const categoryKey = slugify(link.categoryName);
    if (!categorizedResults[categoryKey]) {
      categorizedResults[categoryKey] = {
        blogRssLinks: [],
        name: link.categoryName,
        pathSegments: link.pathSegments,
      };
    }

    if (!categorizedResults[categoryKey].blogRssLinks.includes(link.url)) {
      categorizedResults[categoryKey].blogRssLinks.push(link.url);
    }
  });

  const endTime = Date.now();
  console.log(`Crawling completed in ${(endTime - startTime) / 1000}s`);
  console.log(`Cache stats - URLs: ${urlCache.size}, Content: ${contentCache.size}`);

  return ok(categorizedResults);
};

export const triggerRssCrawler = internalAction({
  args: {},
  handler: async (ctx) => {
    const result = await crawlRssFeeds();

    if (result.isErr()) {
      console.error(`Crawl failed: ${result.error.message}`);
      return err(result.error);
    }

    const topics = Object.entries(result.value).map(([name, data]) => ({
      name,
      tags: data.pathSegments,
      rssUrls: data.blogRssLinks,
    }));

    console.log(`Importing ${topics.length} topics into Convex...`);
    await ctx.runMutation(internal.topics.importCuratedTopics, { topics });

    console.log(`Crawl completed successfully, imported ${topics.length} topics`);
    return { message: `Crawl completed successfully, imported ${topics.length} topics` };
  },
});
