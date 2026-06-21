/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as hydration from "../hydration.js";
import type * as hydrationWeather from "../hydrationWeather.js";
import type * as intervals from "../intervals.js";
import type * as intervalsNode from "../intervalsNode.js";
import type * as lib_credentialCrypto from "../lib/credentialCrypto.js";
import type * as lib_hydration from "../lib/hydration.js";
import type * as lib_intervals from "../lib/intervals.js";
import type * as lib_openMeteo from "../lib/openMeteo.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  hydration: typeof hydration;
  hydrationWeather: typeof hydrationWeather;
  intervals: typeof intervals;
  intervalsNode: typeof intervalsNode;
  "lib/credentialCrypto": typeof lib_credentialCrypto;
  "lib/hydration": typeof lib_hydration;
  "lib/intervals": typeof lib_intervals;
  "lib/openMeteo": typeof lib_openMeteo;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
