import { action } from './_generated/server';
import ky from 'ky';
import * as cheerio from 'cheerio';
import { ok, err, Result, fromPromise, fromThrowable } from 'neverthrow';
import pLimit from 'p-limit';
import { safeParseRSS } from './rss_parser';

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
  BATCH_SIZE: 20,
  RETRY_ATTEMPTS: 2,
  REQUEST_TIMEOUT: 8000,
  MAX_BLOGS_PER_CATEGORY: 5,
  MAX_RSS_ITEMS_TO_PARSE: 5,
  DELAY_BETWEEN_BATCHES: 100,
  MAX_CATEGORIES_TO_PROCESS: 50,
} as const;

const RSS_LIMIT = pLimit(100);
const BLOG_LIMIT = pLimit(100);
const CATEGORY_LIMIT = pLimit(100);

const urlCache = new Map<string, string>();
const contentCache = new Map<string, string>();

const limitArray = <T>(arr: T[], maxSize: number): T[] => arr.slice(0, maxSize);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const slugify = (str: string): string =>
  str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);

const safeParseHTML = fromThrowable(
  (htmlContent: string) => cheerio.load(htmlContent),
  (e) => ({ message: `HTML parse error: ${(e as Error).message}`, step: 'html-parse' }),
);

const safeCreateURL = fromThrowable(
  (urlPath: string, baseUrl: string): string => {
    const cacheKey = `${urlPath}|${baseUrl}`;
    if (urlCache.has(cacheKey)) return urlCache.get(cacheKey)!;

    const result = new URL(urlPath, baseUrl).toString();
    urlCache.set(cacheKey, result);
    return result;
  },
  (e) => ({ message: `URL creation error: ${(e as Error).message}`, step: 'url-creation' }),
);

const httpClient = ky.create({
  retry: CONFIG.RETRY_ATTEMPTS,
  timeout: CONFIG.REQUEST_TIMEOUT,
  headers: {
    'User-Agent': 'RSSBriefBot/1.0',
  },
});

const fetchContent = (url: string, shouldCache = true) => {
  if (shouldCache && contentCache.has(url)) {
    return Promise.resolve(ok(contentCache.get(url)!));
  }

  return fromPromise(
    httpClient(url)
      .text()
      .then((content) => (shouldCache ? (contentCache.set(url, content), content) : content)),
    (e) => ({ message: `Fetch failed: ${(e as Error).message}`, step: 'fetch', url }),
  );
};

// Parse RSS feed and extract blog URLs
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

// Get category URLs from sitemap
const extractCategoryUrls = async (): Promise<Result<string[], CrawlError>> => {
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

// Extract RSS feed URL from category page
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

// Process categories in batches
const processCategories = async (categoryUrls: string[]): Promise<Result<CategoryRss[], CrawlError>> => {
  const categories: CategoryRss[] = [];
  let errorCount = 0;

  for (let i = 0; i < categoryUrls.length; i += CONFIG.BATCH_SIZE) {
    const batch = categoryUrls.slice(i, i + CONFIG.BATCH_SIZE);

    const results = await Promise.all(
      batch.map((url) =>
        CATEGORY_LIMIT(async () => {
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

  console.log(`Processed ${categories.length} categories, ${errorCount} errors`);
  return ok(categories);
};

// Extract blog URLs from category RSS feeds
const extractBlogUrls = async (categories: CategoryRss[]): Promise<Result<BlogRssLink[], CrawlError>> => {
  const blogUrls: BlogRssLink[] = [];

  for (let i = 0; i < categories.length; i += CONFIG.BATCH_SIZE) {
    const batch = categories.slice(i, i + CONFIG.BATCH_SIZE);

    const results = await Promise.all(
      batch.map((category) =>
        RSS_LIMIT(async () => {
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

// Extract RSS feed URL from blog page
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

// Process blog pages to extract RSS feeds
const processBlogPages = async (blogUrls: BlogRssLink[]): Promise<Result<BlogRssLink[], CrawlError>> => {
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
        BLOG_LIMIT(async () => {
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
  const categoryUrlsResult = await extractCategoryUrls();
  if (categoryUrlsResult.isErr()) return err(categoryUrlsResult.error);

  const categoryUrls = limitArray(categoryUrlsResult.value, CONFIG.MAX_CATEGORIES_TO_PROCESS);

  console.log(`Found ${categoryUrlsResult.value.length} category URLs, Processing up to ${categoryUrls.length}`);

  // Process categories to get RSS feeds
  const categoriesResult = await processCategories(categoryUrls);
  if (categoriesResult.isErr()) return err(categoriesResult.error);

  console.log(`Processed ${categoriesResult.value.length} categories with RSS feeds`);

  // Extract blog URLs
  const blogUrlsResult = await extractBlogUrls(categoriesResult.value);
  if (blogUrlsResult.isErr()) return err(blogUrlsResult.error);

  console.log(`Extracted ${blogUrlsResult.value.length} blog URLs`);

  // Process blog pages to get RSS links
  const blogRssLinksResult = await processBlogPages(blogUrlsResult.value);
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

export const fetchAllFeedsAction = action({
  args: {},
  handler: async (ctx) => {
    const result = await crawlRssFeeds();
    return result.match(
      (data) => ({ success: true, data }),
      (error) => ({
        success: false,
        url: error.url,
        step: error.step,
        error: error.message,
      }),
    );
  },
});
