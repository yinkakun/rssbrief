import ky from 'ky';
import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { ok, err, fromPromise, fromThrowable } from 'neverthrow';
import pLimit from 'p-limit';

import { action } from './_generated/server';

interface Category {
  rss: string;
  name: string;
}

interface FeedItem {
  link: string;
  title: string;
}

interface CategoryWithFeeds {
  errors: Array<{
    message: string;
  }>;
  feeds: FeedItem[];
  category: Category;
}

// Utils
const fetchPage = (url: string) =>
  fromPromise(
    ky
      .get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'RSSBriefBot/1.0 (+no-domain)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      })
      .text(),
    (e) => new Error(`Failed to fetch page at ${url}: ` + (e as Error).message),
  );

// Consider making this a utility function if used elsewhere, otherwise inline
const limitArray = (<T>(arr: T[], max: number): T[] => {
  if (arr.length <= max) return arr;
  return arr.slice(0, max);
}) as <T>(arr: T[], max: number) => T[];

// 0. Safe creators

const createSafeXMLParser = fromThrowable(
  (xml: string) => {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
    });
    return parser.parse(xml);
  },
  (e) => new Error('Failed to parse XML: ' + (e as Error).message),
);

const createSafeCheerioParser = fromThrowable(
  (html: string) => cheerio.load(html),
  (e) => new Error('Failed to parse HTML: ' + (e as Error).message),
);

const createSafeURL = fromThrowable(
  (url: string, base: string) => new URL(url, base).toString(),
  (e) => new Error('Failed to create URL: ' + (e as Error).message),
);

async function fetchCategoryPageUrls() {
  const xmlResult = await fetchPage('https://ooh.directory/sitemap-categories.xml');

  if (xmlResult.isErr()) {
    return err(xmlResult.error);
  }

  return createSafeXMLParser(xmlResult.value).andThen((parsed) => {
    const urlset = parsed.urlset;

    if (!urlset || !urlset.url) {
      return err(new Error('Invalid sitemap format: <urlset> or <url> missing'));
    }

    const urlArray = Array.isArray(urlset.url) ? urlset.url : [urlset.url];
    const urls = urlArray.map((url: { loc: string }) => url.loc);

    return ok<string[]>(urls);
  });
}

function extractCategoryPage(html: string) {
  const htmlParser = createSafeCheerioParser(html);

  return htmlParser.andThen(($) => {
    const fullTitle = $('title').first().text(); // e.g. "Blogs about Arts and media (ooh.directory)"

    // remove prefix and suffix
    const name = fullTitle
      .replace(/^Blogs about /, '')
      .replace(/\s*\(.*?\)\s*$/, '') // remove everything in parentheses at the end
      .trim();

    const rssUrl = $('link[rel="alternate"][type="application/rss+xml"]').attr('href');

    if (!rssUrl || !name) {
      return err(new Error('Failed to extract category data: missing RSS link or title'));
    }

    const rssResult = createSafeURL(rssUrl, 'https://ooh.directory');
    if (rssResult.isErr()) {
      return err(new Error(`Failed to create RSS URL: ${rssResult.error.message}`));
    }

    return ok<Category>({
      rss: rssResult.value,
      name,
    });
  });
}

// 1 Fetch categories
async function fetchCategories() {
  const categoryUrlsResult = await fetchCategoryPageUrls();

  if (categoryUrlsResult.isErr()) {
    return { errors: [categoryUrlsResult.error], categories: [] };
  }

  const errors: Array<{
    message: string;
  }> = [];
  const categories: Category[] = [];

  const limit = pLimit(5); // Concurrency limit

  const categoryPromises = limitArray(categoryUrlsResult.value, 10).map((url) =>
    limit(async () => {
      const htmlResult = await fetchPage(url);
      if (htmlResult.isErr()) {
        errors.push({ message: `Failed to fetch category page at ${url}: ${htmlResult.error.message}` });
        return;
      }

      const categoryDataResult = extractCategoryPage(htmlResult.value);
      if (categoryDataResult.isErr()) {
        errors.push({ message: `Failed to extract category data from ${url}: ${categoryDataResult.error.message}` });
        return;
      }
      categories.push(categoryDataResult.value);
    }),
  );

  await Promise.all(categoryPromises);

  return { errors, categories };
}

// 2 Fetch category feeds

async function fetchCategoryFeeds(category: Category) {
  const errors: Array<{
    message: string;
  }> = [];
  const feeds: FeedItem[] = [];

  const categoryRssResult = await fetchPage(category.rss);
  if (categoryRssResult.isErr()) {
    errors.push({ message: `Failed to fetch category RSS at ${category.rss}: ${categoryRssResult.error.message}` });
    return { errors, feeds, category };
  }

  const blogUrlsResult = await extractBlogUrlsFromCategoryRss(categoryRssResult.value);
  if (blogUrlsResult.isErr()) {
    errors.push({ message: `Failed to extract blog URLs from category RSS: ${blogUrlsResult.error.message}` });
    return { errors, feeds, category };
  }

  const limitedBlogUrls = limitArray(blogUrlsResult.value, 10);
  const limit = pLimit(3); // 3 concurrent requests

  const blogFeedPromises = limitedBlogUrls.map((blogUrl) =>
    limit(async () => {
      const blogPageResult = await fetchPage(blogUrl);
      if (blogPageResult.isErr()) {
        errors.push({ message: `Failed to fetch blog page at ${blogUrl}: ${blogPageResult.error.message}` });
        return;
      }

      const rssFeedLinkResult = extractRssFeedLinkFromBlogPage(blogPageResult.value, blogUrl);
      if (rssFeedLinkResult.isErr()) {
        errors.push({
          message: `Failed to extract RSS feed link from blog page at ${blogUrl}: ${rssFeedLinkResult.error.message}`,
        });
        return;
      }

      // TEMPORARY FIX: If the link is relative,exclude it or starts with https://ooh.directory or ./rss.xml
      if (
        rssFeedLinkResult.value.startsWith('/') ||
        rssFeedLinkResult.value.startsWith('https://ooh.directory') ||
        rssFeedLinkResult.value.startsWith('./rss.xml')
      ) {
        console.warn(`Skipping relative RSS link: ${rssFeedLinkResult.value}`);
        return;
      }

      const blogRssFeedResult = await fetchPage(rssFeedLinkResult.value);
      if (blogRssFeedResult.isErr()) {
        console.warn(`Failed to fetch RSS feed for blog ${blogUrl}:`, blogRssFeedResult.error);
        errors.push({ message: `Failed to fetch RSS feed for blog ${blogUrl}: ${blogRssFeedResult.error.message}` });
        return;
      }

      const parsedRssResult = createSafeXMLParser(blogRssFeedResult.value);
      if (parsedRssResult.isErr()) {
        console.warn(`Failed to parse RSS feed for blog ${blogUrl}:`, parsedRssResult.error);
        errors.push({ message: `Failed to parse RSS feed for blog ${blogUrl}: ${parsedRssResult.error.message}` });
        return;
      }

      const rss = parsedRssResult.value.rss || parsedRssResult.value;
      const channel = rss.channel || rss;
      if (!channel || !channel.item) {
        console.warn(`Invalid RSS format for blog ${blogUrl}: no items found`);
        errors.push({ message: `Invalid RSS format for blog ${blogUrl}: no items found` });
        return;
      }

      const items = Array.isArray(channel.item) ? channel.item : [channel.item];
      const feedItems: FeedItem[] = items
        .filter((item: unknown) => {
          const typedItem = item as { link: string; title: string };
          return typedItem.link && typedItem.title;
        })
        .map((item: { link: string; title: string }) => ({
          link: item.link,
          title: item.title,
        }));

      feeds.push(...feedItems);
    }),
  );

  await Promise.all(blogFeedPromises);

  return { errors, feeds, category };
}

async function fetchAllCategoryFeeds() {
  const categoriesResult = await fetchCategories();

  const categories = categoriesResult.categories;

  const categoryWithFeeds: CategoryWithFeeds[] = [];
  const errors: Array<{
    message: string;
  }> = [...categoriesResult.errors];

  const limit = pLimit(2); // Concurrency limit for fetching all category feeds, e.g., 2 categories at a time

  const allCategoryFeedPromises = categories.map((category) =>
    limit(async () => {
      const result = await fetchCategoryFeeds(category);
      categoryWithFeeds.push({
        errors: result.errors,
        feeds: result.feeds,
        category,
      });
    }),
  );

  await Promise.all(allCategoryFeedPromises);

  return {
    errors,
    categoryWithFeeds,
  };
}

function extractRssFeedLinkFromBlogPage(html: string, baseUrl: string) {
  const htmlParser = createSafeCheerioParser(html);

  return htmlParser.andThen(($) => {
    const rssLink = $('link[rel="alternate"][type="application/rss+xml"]').attr('href');
    if (!rssLink) {
      return err(new Error('No RSS link found in blog page'));
    }

    // Use createSafeURL to handle relative URLs
    const absoluteUrlResult = createSafeURL(rssLink, baseUrl);
    if (absoluteUrlResult.isErr()) {
      return err(new Error(`Failed to create absolute RSS URL: ${absoluteUrlResult.error.message}`));
    }

    return ok<string>(absoluteUrlResult.value);
  });
}

async function extractBlogUrlsFromCategoryRss(xml: string) {
  return createSafeXMLParser(xml).andThen((parsed) => {
    const rss = parsed.rss || parsed;
    const channel = rss.channel || rss;

    if (!channel || !channel.item) {
      return err(new Error('Invalid RSS format: no items found'));
    }

    const items = Array.isArray(channel.item) ? channel.item : [channel.item];
    const blogUrls = items.map((item: { link: string }) => item.link);

    return ok<string[]>(blogUrls);
  });
}

// IIFE
(async () => {
  const result = await fetchAllCategoryFeeds();
  if (result.errors.length > 0) {
    console.error('Errors fetching feeds:', result.errors);
  } else {
    console.log('Fetched category feeds successfully:', result.categoryWithFeeds);
  }
})();

export const fetchAllFeedsAction = action({
  args: {},
  handler: async (ctx) => {
    const result = await fetchAllCategoryFeeds();
    if (result.errors.length > 0) {
      console.error('Errors fetching feeds:', result.errors);
    }
    return {
      errors: result.errors,
      categoryFeeds: result.categoryWithFeeds,
    };
  },
});
