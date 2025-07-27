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
import type * as crons from "../crons.js";
import type * as feeds from "../feeds.js";
import type * as http from "../http.js";
import type * as ooh_directory_rss_crawler from "../ooh_directory_rss_crawler.js";
import type * as otp from "../otp.js";
import type * as process_blog from "../process_blog.js";
import type * as rss_parser from "../rss_parser.js";
import type * as topics from "../topics.js";

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
  crons: typeof crons;
  feeds: typeof feeds;
  http: typeof http;
  ooh_directory_rss_crawler: typeof ooh_directory_rss_crawler;
  otp: typeof otp;
  process_blog: typeof process_blog;
  rss_parser: typeof rss_parser;
  topics: typeof topics;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
