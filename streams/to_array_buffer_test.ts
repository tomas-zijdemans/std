// Copyright 2018-2026 the Deno authors. MIT license.

import {
  assertEquals,
  assertFalse,
  assertRejects,
  assertStrictEquals,
} from "@std/assert";
import { toArrayBuffer } from "./to_array_buffer.ts";

Deno.test("toArrayBuffer()", async () => {
  const stream = ReadableStream.from([
    new Uint8Array([1, 2, 3, 4, 5]),
    new Uint8Array([6, 7]),
    new Uint8Array([8, 9]),
  ]);

  const buf = await toArrayBuffer(stream);
  assertEquals(buf, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer);
});

Deno.test("toArrayBuffer() releases the lock after reading the stream", async () => {
  const stream = ReadableStream.from([new Uint8Array([1, 2, 3])]);
  await toArrayBuffer(stream);
  assertFalse(stream.locked);
});

Deno.test("toArrayBuffer() releases the lock when the stream errors", async () => {
  const error = new Error("boom");
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.error(error);
    },
  });
  const rejected = await assertRejects(() => toArrayBuffer(stream));
  assertStrictEquals(rejected, error);
  assertFalse(stream.locked);
});
