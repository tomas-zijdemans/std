// Copyright 2018-2026 the Deno authors. MIT license.
// This module is browser compatible.

import type { GlobOptions } from "./_common/glob_to_reg_exp.ts";
import { isWindows } from "@std/internal/os";

import { globToRegExp as posixGlobToRegExp } from "./posix/glob_to_regexp.ts";
import {
  globToRegExp as windowsGlobToRegExp,
} from "./windows/glob_to_regexp.ts";

export type { GlobOptions };

/**
 * Converts a glob string to a regular expression.
 *
 * Tries to match bash glob expansion as closely as possible.
 *
 * Basic glob syntax:
 * - `*` - Matches everything without leaving the path segment.
 * - `?` - Matches any single character.
 * - `{foo,bar}` - Matches `foo` or `bar`.
 * - `[abcd]` - Matches `a`, `b`, `c` or `d`.
 * - `[a-d]` - Matches `a`, `b`, `c` or `d`.
 * - `[!abcd]` - Matches any single character besides `a`, `b`, `c` or `d`.
 * - `[[:<class>:]]` - Matches any character belonging to `<class>`.
 *     - `[[:alnum:]]` - Matches any digit or letter.
 *     - `[[:digit:]abc]` - Matches any digit, `a`, `b` or `c`.
 *     - See https://facelessuser.github.io/wcmatch/glob/#posix-character-classes
 *       for a complete list of supported character classes.
 * - `\` - Escapes the next character on POSIX.
 * - `` ` `` - Escapes the next character on Windows.
 * - `/` - Path separator.
 * - `\` - Additional path separator on Windows.
 *
 * Extended syntax:
 * - Enabled by default. Disable with `{ extended: false }`.
 * - `?(foo|bar)` - Matches 0 or 1 instance of `{foo,bar}`.
 * - `@(foo|bar)` - Matches 1 instance of `{foo,bar}`. They behave the same.
 * - `*(foo|bar)` - Matches _n_ instances of `{foo,bar}`.
 * - `+(foo|bar)` - Matches _n > 0_ instances of `{foo,bar}`.
 * - `!(foo|bar)` - Matches anything other than `{foo,bar}`.
 * - See https://www.linuxjournal.com/content/bash-extended-globbing.
 *
 * Globstar syntax:
 * - Enabled by default. Disable with `{ globstar: false }`, which makes `**`
 *   behave like `*`.
 * - `**` - Matches any number of any path segments.
 *     - Must comprise its entire path segment in the provided glob.
 * - See https://www.linuxjournal.com/content/globstar-new-bash-globbing-option.
 *
 * Note the following properties:
 * - The generated `RegExp` is anchored at both start and end.
 * - With `{ caseInsensitive: true }`, the whole pattern ignores case.
 * - Repeating and trailing separators are tolerated. Trailing separators in the
 *   provided glob have no meaning and are discarded.
 * - Absolute globs will only match absolute paths, etc.
 * - Empty globs will match nothing.
 * - Brace and extended groups can contain separators, so `?(foo|bar/baz)`
 *   matches `bar/baz`. Outside such groups, a separator in a character class
 *   ends the segment and leaves the class unclosed, so `[a/b]` is taken literally.
 * - If a path segment ends with unclosed groups or a dangling escape prefix, a
 *   parse error has occurred. Every character for that segment is taken
 *   literally in this event.
 *
 * Limitations:
 * - A negative group like `!(foo|bar)` will wrongly be converted to a negative
 *   look-ahead followed by a wildcard. This means that `!(foo).js` will wrongly
 *   fail to match `foobar.js`, even though `foobar` is not `foo`. Effectively,
 *   `!(foo|bar)` is treated like `!(@(foo|bar)*)`. This will work correctly if
 *   the group occurs not nested at the end of the segment.
 *
 * @example Usage
 * ```ts
 * import { globToRegExp } from "@std/path/glob-to-regexp";
 * import { assertEquals } from "@std/assert";
 *
 * if (Deno.build.os === "windows") {
 *   assertEquals(globToRegExp("*.js"), /^[^\\/]*\.js(?:\\|\/)*$/);
 * } else {
 *   assertEquals(globToRegExp("*.js"), /^[^/]*\.js\/*$/);
 * }
 * ```
 *
 * @example Groups spanning path segments
 * ```ts
 * import { globToRegExp } from "@std/path/glob-to-regexp";
 * import { assert } from "@std/assert";
 *
 * const regExp = globToRegExp("src/{lib,test/unit}/*.ts");
 * assert(regExp.test("src/lib/mod.ts"));
 * assert(regExp.test("src/test/unit/mod_test.ts"));
 * assert(!regExp.test("src/test/mod_test.ts"));
 *
 * const classRegExp = globToRegExp("{[a/b],c}");
 * assert(classRegExp.test("a"));
 * assert(classRegExp.test("b"));
 * assert(classRegExp.test("/"));
 * assert(!classRegExp.test("[a/b]"));
 * ```
 *
 * @param glob Glob string to convert.
 * @param options Conversion options.
 * @returns The regular expression equivalent to the glob.
 */
export function globToRegExp(
  glob: string,
  options: GlobOptions = {},
): RegExp {
  return isWindows
    ? windowsGlobToRegExp(glob, options)
    : posixGlobToRegExp(glob, options);
}
