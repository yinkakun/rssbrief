import { action } from './_generated/server';
import ky from 'ky';
import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { ok, err, fromPromise, fromThrowable } from 'neverthrow';
import pLimit from 'p-limit';

// Types
interface CategoryItem {
  url: string;
  name: string;
  pathSegments: string[];
  rssFeedUrl: string;
}

interface BlogRssLink {
  url: string;
  categoryName: string;
  pathSegments: string[];
}

// Configuration
const CONFIG = {
  BATCH_SIZE: 50,
  REQUEST_TIMEOUT: 1000,
  MAX_BLOGS_PER_CATEGORY: 5,
  MAX_RSS_ITEMS_TO_PARSE: 10,
} as const;

// Rate limiters
const RSS_LIMIT = pLimit(10);
const BLOG_LIMIT = pLimit(10);
const CATEGORY_LIMIT = pLimit(50);

// Caches
const urlCache = new Map<string, string>();
const contentCache = new Map<string, string>();

// Utilities
const limitArray = <T>(arr: T[], maxSize: number): T[] => arr.slice(0, maxSize);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Safe parsers
const safeParseXML = fromThrowable(
  (xmlContent: string) =>
    new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
    }).parse(xmlContent),
  (e) => new Error(`XML parse error: ${(e as Error).message}`),
);

const safeParseHTML = fromThrowable(
  (htmlContent: string) => cheerio.load(htmlContent),
  (e) => new Error(`HTML parse error: ${(e as Error).message}`),
);

const safeCreateURL = fromThrowable(
  (urlPath: string, baseUrl: string) => {
    const cacheKey = `${urlPath}|${baseUrl}`;
    if (urlCache.has(cacheKey)) return urlCache.get(cacheKey)!;

    const result = new URL(urlPath, baseUrl).toString();
    urlCache.set(cacheKey, result);
    return result;
  },
  (e) => new Error(`URL creation error: ${(e as Error).message}`),
);

// HTTP client
const fetchContent = async (url: string, useCache = true) => {
  if (useCache && contentCache.has(url)) {
    return ok(contentCache.get(url)!);
  }

  return fromPromise(
    ky
      .get(url, {
        timeout: CONFIG.REQUEST_TIMEOUT,
        headers: {
          'User-Agent': 'RSSBriefBot/1.0',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        retry: 1,
      })
      .text()
      .then((content) => {
        if (useCache) contentCache.set(url, content);
        return content;
      }),
    (e) => new Error(`Fetch failed for ${url}: ${(e as Error).message}`),
  );
};

// Parse RSS feed and extract blog URLs
const parseRssFeed = (xmlContent: string) => {
  return safeParseXML(xmlContent).andThen((parsedXml) => {
    const channel = parsedXml.rss?.channel || parsedXml.channel || parsedXml;
    if (!channel?.item) return err(new Error('No RSS items found'));

    const items = Array.isArray(channel.item) ? channel.item : [channel.item];
    const blogUrls = limitArray(items, CONFIG.MAX_RSS_ITEMS_TO_PARSE)
      .map((item) => (item as { link: string }).link)
      .filter(Boolean);

    return ok(blogUrls);
  });
};

// Get category URLs from sitemap
const getCategoryUrls = async () => {
  const result = await fetchContent('https://ooh.directory/sitemap-categories.xml');
  if (result.isErr()) return result;

  return safeParseXML(result.value).andThen((parsedXml) => {
    const urlEntries = parsedXml.urlset?.url;
    if (!urlEntries) return err(new Error('Invalid sitemap format'));

    const urls = (Array.isArray(urlEntries) ? urlEntries : [urlEntries])
      .map((entry) => entry.loc)
      .filter((url) => url.includes('/blogs/') && !url.endsWith('/blogs/'));

    return ok(urls);
  });
};

// Extract category data and RSS feed URL from category page
const processCategoryPage = async (categoryUrl: string) => {
  const htmlResult = await fetchContent(categoryUrl);
  if (htmlResult.isErr()) return htmlResult;

  return safeParseHTML(htmlResult.value).andThen(($) => {
    const title = $('title').text();
    const categoryName = title
      .replace(/^Blogs about /, '')
      .replace(/\s*\(.*?\)\s*$/, '')
      .trim();
    const rssFeedHref = $('link[rel="alternate"][type="application/rss+xml"]').attr('href');

    if (!categoryName || !rssFeedHref) {
      return err(new Error('Missing category name or RSS feed'));
    }

    const rssFeedUrlResult = safeCreateURL(rssFeedHref, 'https://ooh.directory');
    if (rssFeedUrlResult.isErr()) return err(rssFeedUrlResult.error);

    const pathSegments = categoryUrl.replace('https://ooh.directory/blogs/', '').split('/').filter(Boolean);

    return ok({
      url: categoryUrl,
      name: categoryName,
      pathSegments,
      rssFeedUrl: rssFeedUrlResult.value,
    });
  });
};

// Process categories in batches
const processCategories = async (categoryUrls: string[]) => {
  const categories: CategoryItem[] = [];
  const errors: string[] = [];

  for (let i = 0; i < categoryUrls.length; i += CONFIG.BATCH_SIZE) {
    const batch = categoryUrls.slice(i, i + CONFIG.BATCH_SIZE);

    const results = await Promise.all(
      batch.map((url) =>
        CATEGORY_LIMIT(async () => {
          const result = await processCategoryPage(url);
          return result.isOk() ? result.value : null;
        }),
      ),
    );

    categories.push(...results.filter((item): item is CategoryItem => item !== null));
    if (i + CONFIG.BATCH_SIZE < categoryUrls.length) await delay(0);
  }

  return { categories, errors };
};

// Extract blog URLs from category RSS feeds
const extractBlogUrls = async (categories: CategoryItem[]) => {
  const blogUrls: Array<{ url: string; categoryName: string; pathSegments: string[] }> = [];

  for (let i = 0; i < categories.length; i += CONFIG.BATCH_SIZE) {
    const batch = categories.slice(i, i + CONFIG.BATCH_SIZE);

    const results = await Promise.all(
      batch.map((category) =>
        RSS_LIMIT(async () => {
          const feedResult = await fetchContent(category.rssFeedUrl);
          if (feedResult.isErr()) return [];

          const urlsResult = parseRssFeed(feedResult.value);
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
    if (i + CONFIG.BATCH_SIZE < categories.length) await delay(150);
  }

  return blogUrls;
};

// Extract RSS feed URL from blog page
const extractBlogRssFeed = (htmlContent: string, blogUrl: string) => {
  return safeParseHTML(htmlContent).andThen(($) => {
    const selectors = [
      'link[rel="alternate"][type="application/rss+xml"]',
      'link[rel="alternate"][type="application/atom+xml"]',
    ];

    for (const selector of selectors) {
      const href = $(selector).first().attr('href');
      if (href) {
        if (href.startsWith('http')) return ok(href);

        const absoluteUrlResult = safeCreateURL(href, blogUrl);
        if (absoluteUrlResult.isOk()) return ok(absoluteUrlResult.value);
      }
    }

    return err(new Error('No RSS feed found'));
  });
};

// Process blog pages to extract RSS feeds
const processBlogPages = async (blogUrls: Array<{ url: string; categoryName: string; pathSegments: string[] }>) => {
  const blogRssLinks: BlogRssLink[] = [];

  // Deduplicate blogs
  const uniqueBlogs = new Map<string, { url: string; categories: Array<{ name: string; pathSegments: string[] }> }>();

  for (const blog of blogUrls) {
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
  }

  const blogs = Array.from(uniqueBlogs.values());
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

    const filteredResults = results.filter((item): item is BlogRssLink[] => item !== null);
    blogRssLinks.push(...filteredResults.flat());

    if (i + CONFIG.BATCH_SIZE < blogs.length) await delay(200);
  }

  return blogRssLinks;
};

// Main crawler function
const crawlRssFeeds = async () => {
  console.log('Starting RSS feed crawling...');
  const startTime = Date.now();

  // Get category URLs
  const categoryUrlsResult = await getCategoryUrls();
  if (categoryUrlsResult.isErr()) {
    return err(new Error(`Failed to fetch categories: ${categoryUrlsResult.error.message}`));
  }

  console.log(`Found ${categoryUrlsResult.value.length} category URLs`);

  // Process categories: Gets stuck here
  const { categories } = await processCategories(categoryUrlsResult.value);
  console.log(`Processed ${categories.length} categories with RSS feeds`);

  // Extract blog URLs
  const blogUrls = await extractBlogUrls(categories);
  console.log(`Extracted ${blogUrls.length} blog URLs`);

  // Process blog pages
  const blogRssLinks = await processBlogPages(blogUrls);
  console.log(`Found ${blogRssLinks.length} blog RSS links`);

  // Categorize results
  const categorizedResults: Record<string, { pathSegments: string[]; blogRssLinks: string[] }> = {};

  for (const link of blogRssLinks) {
    if (!categorizedResults[link.categoryName]) {
      categorizedResults[link.categoryName] = {
        pathSegments: link.pathSegments,
        blogRssLinks: [],
      };
    }

    if (!categorizedResults[link.categoryName].blogRssLinks.includes(link.url)) {
      categorizedResults[link.categoryName].blogRssLinks.push(link.url);
    }
  }

  const endTime = Date.now();
  console.log(`Crawling completed in ${(endTime - startTime) / 1000}s`);
  console.log(`Cache stats - URLs: ${urlCache.size}, Content: ${contentCache.size}`);

  return ok(categorizedResults);
};

// Action export
export const fetchAllFeedsAction = action({
  args: {},
  handler: async (ctx) => {
    const result = await crawlRssFeeds();

    if (result.isErr()) {
      return {
        success: false,
        error: result.error.message,
      };
    }

    return {
      success: true,
      data: result.value,
    };
  },
});

// IIFE
(async () => {
  try {
    const result = await crawlRssFeeds();
    if (result.isErr()) {
      console.error(`Crawl failed: ${result.error.message}`);
    } else {
      console.log('Crawl completed successfully:', result.value);
    }
  } catch (error) {
    console.error('Unexpected error during crawl:', (error as Error).message);
  }
})();
