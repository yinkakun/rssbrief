import ky from 'ky';
import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { ok, err, fromPromise, fromThrowable } from 'neverthrow';
import pLimit from 'p-limit';

import { action } from './_generated/server';

interface CrawlError {
  type?: string;
  message: string;
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

const limitArray = (<T>(arr: T[], max: number): T[] => {
  if (arr.length <= max) return arr;
  return arr.slice(0, max);
}) as <T>(arr: T[], max: number) => T[];

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

const createSafeHtmlParser = fromThrowable(
  (html: string) => cheerio.load(html),
  (e) => new Error('Failed to parse HTML: ' + (e as Error).message),
);

const createSafeURL = fromThrowable(
  (url: string, base: string) => new URL(url, base).toString(),
  (e) => new Error('Failed to create URL: ' + (e as Error).message),
);

async function fetchCategorySitemap() {
  const siteMap = 'https://ooh.directory/sitemap-categories.xml';
  const xmlResult = await fetchPage(siteMap);

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

interface CategorySitemap extends CategoryTreeItem {
  rss: string;
}

function extractCategoryPageRss(html: string, categoryItem: CategoryTreeItem) {
  const htmlParser = createSafeHtmlParser(html);

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

    return ok<CategorySitemap>({
      ...categoryItem,
      rss: rssResult.value,
    });
  });
}

interface TreeNode {
  name: string;
  urls: string[];
  children: { [key: string]: TreeNode };
}

interface CategoryTree {
  [category: string]: TreeNode;
}

interface CategoryTreeItem {
  url: string;
  name: string;
  path: string[];
}

function buildUrlTree(urls: string[]): CategoryTree {
  const tree: CategoryTree = {};

  for (const url of urls) {
    const path = url.replace('https://ooh.directory/blogs/', '');

    if (!path || path === '/') continue;

    const segments = path.split('/').filter((segment) => segment.length > 0);

    let currentLevel = tree;

    // Navigate/create the tree structure
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      if (!currentLevel[segment]) {
        currentLevel[segment] = {
          name: segment,
          urls: [],
          children: {},
        };
      }

      if (i === segments.length - 1) {
        if (!currentLevel[segment].urls.includes(url)) {
          currentLevel[segment].urls.push(url);
        }
      }

      currentLevel = currentLevel[segment].children;
    }
  }

  function removeUrlsFromParentNodes(node: TreeNode): boolean {
    const hasChildren = Object.keys(node.children).length > 0;

    for (const child of Object.values(node.children)) {
      removeUrlsFromParentNodes(child);
    }

    if (hasChildren) {
      node.urls = [];
    }

    return hasChildren;
  }

  for (const rootNode of Object.values(tree)) {
    removeUrlsFromParentNodes(rootNode);
  }

  return tree;
}

function getCategoriesWithUrls(tree: CategoryTree): CategoryTreeItem[] {
  const result: CategoryTreeItem[] = [];

  function traverse(node: TreeNode, currentPath: string[] = []) {
    const nodePath = [...currentPath, node.name];

    for (const url of node.urls) {
      result.push({
        url: url,
        path: nodePath,
        name: node.name,
      });
    }

    for (const child of Object.values(node.children)) {
      traverse(child, nodePath);
    }
  }

  // start traversal from the root nodes
  for (const rootNode of Object.values(tree)) {
    traverse(rootNode);
  }

  return result;
}

// 1 Fetch category sitemaps
// {
//   name: 'houses',
//   path: [ 'arts', 'architecture', 'houses' ],
//   url: 'https://ooh.directory/blogs/arts/architecture/houses/',
//   rss: 'https://ooh.directory/feeds/cats/96jzx8/rss/houses.xml'
// }[]
async function fetchAllCategorySitemaps() {
  const categorySitemapResult = await fetchCategorySitemap();

  if (categorySitemapResult.isErr()) {
    return err(new Error(`Failed to fetch category URLs: ${categorySitemapResult.error.message}`));
  }

  const categorySitemap = buildUrlTree(categorySitemapResult.value);
  const finalCategoryLinks = getCategoriesWithUrls(categorySitemap);

  const errors: CrawlError[] = [];
  const sitemaps: {
    rss: string;
    name: string;
    path: string[];
  }[] = [];

  const limitedFinalCategoryLinks = limitArray(finalCategoryLinks, 10);

  const concurrencyLimit = 10;
  const categoryPromises = limitedFinalCategoryLinks.map((categoryItem) => {
    return pLimit(concurrencyLimit)(async () => {
      const categoryPageHtml = await fetchPage(categoryItem.url);
      if (categoryPageHtml.isErr()) {
        errors.push({
          message: `Failed to fetch category page at ${categoryItem.url}: ${categoryPageHtml.error.message}`,
        });
        return;
      }

      const categoryItemWithRssResult = extractCategoryPageRss(categoryPageHtml.value, categoryItem);
      if (categoryItemWithRssResult.isErr()) {
        errors.push({
          message: `Failed to extract category data from ${categoryItem.url}: ${categoryItemWithRssResult.error.message}`,
        });
        return;
      }

      sitemaps.push(categoryItemWithRssResult.value);
    });
  });

  await Promise.all(categoryPromises);

  return ok({
    errors,
    sitemap: sitemaps,
  });
}

async function extractCategoryRssLinks(category: { rss: string; name: string; path: string[] }) {
  const categoryPageResult = await fetchPage(category.rss);

  if (categoryPageResult.isErr()) {
    return err(new Error(`Failed to fetch category page at ${category.rss}: ${categoryPageResult.error.message}`));
  }

  const blogUrlsResult = await extractBlogUrlsFromCategoryRss(categoryPageResult.value);
  if (blogUrlsResult.isErr()) {
    return err(new Error(`Failed to extract blog URLs from category RSS: ${blogUrlsResult.error.message}`));
  }

  const limitedBlogUrls = limitArray(blogUrlsResult.value, 10);

  const crawlErrors: CrawlError[] = [];

  const concurrencyLimit = 10;
  const rssLinksPromise = limitedBlogUrls.map((blogUrl) => {
    return pLimit(concurrencyLimit)(async () => {
      const blogPageResult = await fetchPage(blogUrl);
      if (blogPageResult.isErr()) {
        crawlErrors.push({ message: `Failed to fetch blog page at ${blogUrl}: ${blogPageResult.error.message}` });
        return undefined;
      }

      const rssFeedLinkResult = extractRssFeedLinkFromBlogPage(blogPageResult.value, blogUrl);
      if (rssFeedLinkResult.isErr()) {
        console.warn(`Failed to extract RSS feed link from blog page at ${blogUrl}:`, rssFeedLinkResult.error);
        crawlErrors.push({
          message: `Failed to extract RSS feed link from blog page at ${blogUrl}: ${rssFeedLinkResult.error.message}`,
        });
        return undefined;
      }

      // const blogRssFeedResult = await fetchPage(rssFeedLinkResult.value);
      // if (blogRssFeedResult.isErr()) {
      //   console.warn(`Failed to fetch RSS feed for blog ${blogUrl}:`, blogRssFeedResult.error);
      //   crawlErrors.push({
      //     message: `Failed to fetch RSS feed for blog ${blogUrl}: ${blogRssFeedResult.error.message}`,
      //   });
      //   return undefined;
      // }

      return rssFeedLinkResult.value;
    });
  });

  const rssLinksResults = await Promise.all(rssLinksPromise);

  return ok({
    errors: crawlErrors,
    rssLinks: rssLinksResults.filter((link) => link !== undefined),
  });
}

async function fetchAllCategoryRssLinks() {
  const categorySitemapsResult = await fetchAllCategorySitemaps();

  if (categorySitemapsResult.isErr()) {
    return err(new Error(`Failed to fetch categories: ${categorySitemapsResult.error.message}`));
  }

  const groupedCategories: Record<
    string,
    {
      path: string[];
      rssLinks: string[];
    }
  > = {};

  const concurrencyLimit = 10;
  const allCategoryFeedPromises = categorySitemapsResult.value.sitemap.map((categorySitemap) => {
    return pLimit(concurrencyLimit)(async () => {
      const rssLinksResult = await extractCategoryRssLinks(categorySitemap);

      if (rssLinksResult.isErr()) {
        console.warn(`Failed to extract RSS links for category ${categorySitemap.name}:`, rssLinksResult.error);
        return;
      }

      console.log('LINKS', rssLinksResult.value);

      if (!groupedCategories[categorySitemap.name]) {
        groupedCategories[categorySitemap.name] = {
          path: categorySitemap.path,
          rssLinks: rssLinksResult.value.rssLinks,
        };
      } else {
        console.warn(`Duplicate category found: ${categorySitemap.name}. Merging RSS links.`);
      }
    });
  });

  await Promise.all(allCategoryFeedPromises);

  return ok(groupedCategories);
}

function extractRssFeedLinkFromBlogPage(html: string, baseUrl: string) {
  const selectors = [
    'link[rel="alternate"][type="application/rss+xml"]',
    'link[rel="alternate"][type="application/atom+xml"]',
    'link[rel="alternate"][type*="rss"]',
    'link[rel="alternate"][type*="atom"]',
  ];

  return createSafeHtmlParser(html).andThen(($) => {
    for (const selector of selectors) {
      const link = $(selector).first();
      if (link.length > 0) {
        const feedUrl = link.attr('href');
        if (feedUrl) {
          // Attempt to resolve the URL immediately and return if successful
          const absoluteUrlResult = createAbsoluteUrl(feedUrl, baseUrl);
          if (absoluteUrlResult.isOk()) {
            return ok(absoluteUrlResult.value);
          }
          // If resolution failed for this specific feedUrl, log it and try the next selector
          console.warn(
            `Could not resolve feed URL "${feedUrl}" with base "${baseUrl}": ${absoluteUrlResult.error.message}`,
          );
        }
      }
    }

    return err(new Error('No valid RSS/Atom link found in blog page.'));
  });
}

function createAbsoluteUrl(url: string, baseUrl: string) {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return ok(url);
  }

  const resolvedUrlResult = createSafeURL(url, baseUrl);

  if (resolvedUrlResult.isOk()) {
    return ok(resolvedUrlResult.value.toString());
  }

  return err(
    new Error(`Failed to create absolute URL from "${url}" with base "${baseUrl}": ${resolvedUrlResult.error.message}`),
  );
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

export const fetchAllFeedsAction = action({
  args: {},
  handler: async (ctx) => {
    const result = await fetchAllCategoryRssLinks();

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
