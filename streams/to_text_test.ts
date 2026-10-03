// Copyright 2018-2026 the Deno authors. MIT license.

import {
  assertEquals,
  assertFalse,
  assertRejects,
  assertStrictEquals,
} from "@std/assert";
import { toText } from "./to_text.ts";

Deno.test("toText()", async () => {
  const strings = ["hello", " js ", "fans", " 中文♥"];
  const expected = "hello js fans 中文♥";

  const byteStream = ReadableStream.from(strings)
    .pipeThrough(new TextEncoderStream());
  assertEquals(await toText(byteStream), expected);

  const stringStream = ReadableStream.from(strings);
  assertEquals(await toText(stringStream), expected);
});

Deno.test("toText() releases the lock after reading the stream", async () => {
  const stream = ReadableStream.from(["hello"]);
  await toText(stream);
  assertFalse(stream.locked);
});

Deno.test("toText() releases the lock when the stream errors", async () => {
  const error = new Error("boom");
  const stream = new ReadableStream<string>({
    pull(controller) {
      controller.error(error);
    },
  });
  const rejected = await assertRejects(() => toText(stream));
  assertStrictEquals(rejected, error);
  assertFalse(stream.locked);
});

Deno.test("toText() cancels the stream when a chunk cannot be decoded", async () => {
  const reasons: unknown[] = [];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(42 as unknown as Uint8Array);
    },
    cancel(reason) {
      reasons.push(reason);
    },
  });
  const error = await assertRejects(() => toText(stream), TypeError);
  assertEquals(reasons, [error]);
  assertFalse(stream.locked);
});

Deno.test("toText() rejects with the original error when cancel rejects", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(42 as unknown as Uint8Array);
    },
    cancel() {
      throw new Error("cancel failed");
    },
  });
  await assertRejects(() => toText(stream), TypeError);
  assertFalse(stream.locked);
});

Deno.test("toText() does not wait for a cancel that never settles", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(42 as unknown as Uint8Array);
    },
    cancel() {
      return new Promise(() => {});
    },
  });
  await assertRejects(() => toText(stream), TypeError);
  assertFalse(stream.locked);
});
