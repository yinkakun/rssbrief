/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as auth from "../auth.js";
import type * as briefs from "../briefs.js";
import type * as crons from "../crons.js";
import type * as feeds from "../feeds.js";
import type * as http from "../http.js";
import type * as preferences from "../preferences.js";
import type * as rss_crawler from "../rss_crawler.js";
import type * as rss_parser from "../rss_parser.js";
import type * as saved_articles from "../saved_articles.js";
import type * as topics from "../topics.js";
import type * as utils from "../utils.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  briefs: typeof briefs;
  crons: typeof crons;
  feeds: typeof feeds;
  http: typeof http;
  preferences: typeof preferences;
  rss_crawler: typeof rss_crawler;
  rss_parser: typeof rss_parser;
  saved_articles: typeof saved_articles;
  topics: typeof topics;
  utils: typeof utils;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
