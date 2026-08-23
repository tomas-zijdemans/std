// Copyright 2018-2026 the Deno authors. MIT license.
import { retry } from "./unstable_retry.ts";
import { RetryError } from "./retry.ts";
import { assertEquals, assertRejects } from "@std/assert";
import { FakeTime } from "@std/testing/time";

Deno.test("retry() retries until the function succeeds", async () => {
  let attempts = 0;
  const result = await retry(() => {
    attempts++;
    if (attempts < 3) throw new Error("Not yet");
    return "success";
  }, { minTimeout: 1 });
  assertEquals(result, "success");
  assertEquals(attempts, 3);
});

Deno.test("retry() calls onRetry once per retry with 1-based attempt numbers", async () => {
  const attempts: number[] = [];
  await assertRejects(
    () =>
      retry(() => {
        throw new Error("Failure");
      }, {
        maxAttempts: 4,
        minTimeout: 1,
        jitter: 0,
        onRetry: (_error, attempt, _delay) => {
          attempts.push(attempt);
        },
      }),
    RetryError,
  );
  assertEquals(attempts, [1, 2, 3]);
});

Deno.test("retry() passes the thrown error to onRetry", async () => {
  const thrown = new Error("Specific failure");
  const seen: unknown[] = [];
  await assertRejects(
    () =>
      retry(() => {
        throw thrown;
      }, {
        maxAttempts: 2,
        minTimeout: 1,
        onRetry: (error) => {
          seen.push(error);
        },
      }),
    RetryError,
  );
  assertEquals(seen, [thrown]);
});

Deno.test("retry() passes the computed backoff delay to onRetry", async () => {
  using time = new FakeTime();
  const delays: number[] = [];
  const promise = retry(() => {
    throw new Error("Failure");
  }, {
    jitter: 0,
    onRetry: (_error, _attempt, delay) => {
      delays.push(delay);
    },
  });
  await time.runAllAsync();
  await assertRejects(() => promise, RetryError);
  assertEquals(delays, [1000, 2000, 4000, 8000]);
});

Deno.test("retry() calls onRetry before the backoff wait begins", async () => {
  using time = new FakeTime();
  let called = false;
  const promise = retry(() => {
    throw new Error("Failure");
  }, {
    maxAttempts: 2,
    jitter: 0,
    onRetry: () => {
      called = true;
    },
  });
  await time.runMicrotasks();
  assertEquals(called, true); // fired while no fake time has advanced
  await time.runAllAsync();
  await assertRejects(() => promise, RetryError);
});

Deno.test("retry() does not call onRetry when the first attempt succeeds", async () => {
  let calls = 0;
  const result = await retry(() => "ok", {
    onRetry: () => {
      calls++;
    },
  });
  assertEquals(result, "ok");
  assertEquals(calls, 0);
});

Deno.test("retry() does not call onRetry when isRetriable returns false", async () => {
  let calls = 0;
  await assertRejects(
    () =>
      retry(() => {
        throw new Error("Failure");
      }, {
        isRetriable: () => false,
        onRetry: () => {
          calls++;
        },
      }),
    Error,
    "Failure",
  );
  assertEquals(calls, 0);
});

Deno.test("retry() does not call onRetry for the terminal failure", async () => {
  let calls = 0;
  await assertRejects(
    () =>
      retry(() => {
        throw new Error("Failure");
      }, {
        maxAttempts: 1,
        onRetry: () => {
          calls++;
        },
      }),
    RetryError,
  );
  assertEquals(calls, 0);
});

Deno.test("retry() does not call onRetry when the signal is already aborted", async () => {
  const controller = new AbortController();
  let calls = 0;
  const error = await assertRejects(() =>
    retry(() => {
      controller.abort("cancelled");
      throw new Error("Failure");
    }, {
      signal: controller.signal,
      minTimeout: 1,
      onRetry: () => {
        calls++;
      },
    })
  );
  assertEquals(error, "cancelled");
  assertEquals(calls, 0);
});

Deno.test("retry() rejects with the error thrown by onRetry and stops retrying", async () => {
  const callbackError = new Error("Callback failure");
  let attempts = 0;
  const error = await assertRejects(() =>
    retry(() => {
      attempts++;
      throw new Error("Failure");
    }, {
      onRetry: () => {
        throw callbackError;
      },
    })
  );
  assertEquals(error, callbackError);
  assertEquals(attempts, 1);
});
