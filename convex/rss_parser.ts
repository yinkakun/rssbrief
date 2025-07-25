'use node';
import ky from 'ky';
import { z } from 'zod';
import { XMLParser } from 'fast-xml-parser';
import { ok, err, Result, fromPromise, fromThrowable } from 'neverthrow';

const RSSItemSchema = z.object({
  link: z.string().optional(),
  pubDate: z.string().optional(),
});

const RSSChannelSchema = z.object({
  link: z.string().optional(),
  item: z.union([RSSItemSchema, z.array(RSSItemSchema)]).optional(),
});

const RSSFeedSchema = z.object({
  rss: z.object({
    channel: RSSChannelSchema,
  }),
});

export type RSSItem = z.infer<typeof RSSItemSchema>;

export type RSSFeed = {
  link?: string;
  items: RSSItem[];
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

const httpClient = ky.create({
  timeout: 1000 * 2, // 2 seconds
  headers: {
    'User-Agent': 'RSSBriefBot/1.0',
  },
});

const safeXmlParse = fromThrowable(
  (xmlData: string) => xmlParser.parse(xmlData),
  (e) => ({ message: `XML parse error: ${(e as Error).message}`, step: 'xml-parse' }),
);

const safeValidate = fromThrowable(
  (data: unknown) => RSSFeedSchema.parse(data),
  (e) => ({ message: `Validation error: ${(e as Error).message}`, step: 'validation' }),
);

const parseFeed = (xmlData: string): Result<RSSFeed, { message: string; step: string }> => {
  return safeXmlParse(xmlData)
    .andThen(safeValidate)
    .map((validated) => {
      const channel = validated.rss.channel;
      const items = channel.item ? (Array.isArray(channel.item) ? channel.item : [channel.item]) : [];

      return {
        link: channel.link,
        items,
      };
    });
};

export const safeParseRSS = (feedUrl: string) =>
  fromPromise(httpClient.get(feedUrl).text(), (e) => ({
    message: `HTTP request error: ${(e as Error).message}`,
    step: 'http-fetch',
    url: feedUrl,
  })).match(
    (xmlData) => {
      const result = parseFeed(xmlData);
      if (result.isErr()) {
        return err(result.error);
      }
      return ok(result.value);
    },
    (error) => err({ message: error.message, step: 'fetch', url: feedUrl }),
  );
