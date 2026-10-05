// Copyright 2018-2026 the Deno authors. MIT license.
import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import { IntrusiveList, IntrusiveListNode } from "./unstable_intrusive_list.ts";

class Item extends IntrusiveListNode {
  constructor(readonly id: number) {
    super();
  }
}

function makeList(...ids: number[]): [IntrusiveList<Item>, Item[]] {
  const list = new IntrusiveList<Item>();
  const items = ids.map((id) => new Item(id));
  for (const item of items) list.pushBack(item);
  return [list, items];
}

function ids(list: IntrusiveList<Item>): number[] {
  return [...list].map((item) => item.id);
}

/** Checks that every observable view of the list agrees with `expected`. */
function assertList(list: IntrusiveList<Item>, expected: number[]) {
  assertEquals(ids(list), expected);
  assertEquals(list.length, expected.length);
  assertEquals(list.peekFront()?.id, expected[0]);
  assertEquals(list.peekBack()?.id, expected.at(-1));
}

Deno.test("IntrusiveList starts empty", () => {
  const list = new IntrusiveList<Item>();
  assertList(list, []);
  assertEquals(list.popFront(), undefined);
  assertEquals(list.popBack(), undefined);
  assertList(list, []);
});

Deno.test("IntrusiveList.pushBack() appends a detached node", () => {
  const list = new IntrusiveList<Item>();
  list.pushBack(new Item(1));
  assertList(list, [1]);
  list.pushBack(new Item(2));
  assertList(list, [1, 2]);
  list.pushBack(new Item(3));
  assertList(list, [1, 2, 3]);
});

Deno.test("IntrusiveList.pushBack() throws on a node already in this list", () => {
  const [list, [a, b]] = makeList(1, 2);
  for (const node of [a!, b!]) {
    assertThrows(
      () => list.pushBack(node),
      TypeError,
      "Cannot push into IntrusiveList: node is already in a list",
    );
  }
  assertList(list, [1, 2]);
});

Deno.test("IntrusiveList.pushBack() throws on a node in another list", () => {
  const [first, [a]] = makeList(1, 2);
  const [second] = makeList(3);
  assertThrows(
    () => second.pushBack(a!),
    TypeError,
    "Cannot push into IntrusiveList: node is already in a list",
  );
  assertList(first, [1, 2]);
  assertList(second, [3]);
});

Deno.test("IntrusiveList.pushBack() throws on a value that is not a node", () => {
  const list = new IntrusiveList<Item>();
  assertThrows(() => list.pushBack({ id: 1 } as Item), TypeError);
  assertList(list, []);
});

Deno.test("IntrusiveList.popFront() and popBack() detach the end nodes", () => {
  const [list, [a, b, c, d]] = makeList(1, 2, 3, 4);
  assertStrictEquals(list.popFront(), a);
  assertList(list, [2, 3, 4]);
  assertStrictEquals(list.popBack(), d);
  assertList(list, [2, 3]);
  assertStrictEquals(list.popBack(), c);
  assertList(list, [2]);
  assertStrictEquals(list.popFront(), b);
  assertList(list, []);
  assertEquals(list.popFront(), undefined);
  assertEquals(list.popBack(), undefined);
  for (const node of [a!, b!, c!, d!]) assertEquals(list.remove(node), false);
});

Deno.test("IntrusiveList.remove() detaches a node in this list", async (t) => {
  await t.step("only node", () => {
    const [list, [a]] = makeList(1);
    assertEquals(list.remove(a!), true);
    assertList(list, []);
  });
  await t.step("head", () => {
    const [list, [a]] = makeList(1, 2, 3);
    assertEquals(list.remove(a!), true);
    assertList(list, [2, 3]);
  });
  await t.step("middle", () => {
    const [list, [, b]] = makeList(1, 2, 3);
    assertEquals(list.remove(b!), true);
    assertList(list, [1, 3]);
  });
  await t.step("tail", () => {
    const [list, [, , c]] = makeList(1, 2, 3);
    assertEquals(list.remove(c!), true);
    assertList(list, [1, 2]);
  });
  await t.step("every node, then pushBack again", () => {
    const [list, items] = makeList(1, 2, 3, 4);
    for (const item of [items[1]!, items[3]!, items[0]!, items[2]!]) {
      assertEquals(list.remove(item), true);
    }
    assertList(list, []);
    list.pushBack(items[2]!);
    list.pushBack(items[0]!);
    assertList(list, [3, 1]);
  });
});

Deno.test("IntrusiveList.remove() returns false for a detached node", () => {
  const [list, [a, b]] = makeList(1, 2);
  assertEquals(list.remove(new Item(9)), false);
  assertEquals(list.remove(a!), true);
  assertEquals(list.remove(a!), false);
  assertList(list, [2]);

  assertStrictEquals(list.popFront(), b);
  assertEquals(list.remove(b!), false);
  assertList(list, []);
});

Deno.test("IntrusiveList.remove() throws on a node in another list", () => {
  const [first, [a, b, c]] = makeList(1, 2, 3);
  const [second] = makeList(4);
  for (const node of [a!, b!, c!]) {
    assertThrows(
      () => second.remove(node),
      TypeError,
      "Cannot remove from IntrusiveList: node is in another list",
    );
  }
  assertList(first, [1, 2, 3]);
  assertList(second, [4]);
});

Deno.test("IntrusiveList.moveToBack() moves a node in this list", async (t) => {
  await t.step("head", () => {
    const [list, [a]] = makeList(1, 2, 3);
    list.moveToBack(a!);
    assertList(list, [2, 3, 1]);
  });
  await t.step("middle", () => {
    const [list, [, b]] = makeList(1, 2, 3);
    list.moveToBack(b!);
    assertList(list, [1, 3, 2]);
  });
  await t.step("tail is a no-op", () => {
    const [list, [, , c]] = makeList(1, 2, 3);
    list.moveToBack(c!);
    assertList(list, [1, 2, 3]);
  });
  await t.step("only node is a no-op", () => {
    const [list, [a]] = makeList(1);
    list.moveToBack(a!);
    assertList(list, [1]);
  });
  await t.step("head of a two-node list", () => {
    const [list, [a, b]] = makeList(1, 2);
    list.moveToBack(a!);
    assertList(list, [2, 1]);
    list.moveToBack(b!);
    assertList(list, [1, 2]);
  });
  await t.step("moved node keeps working with remove and pop", () => {
    const [list, [a, b]] = makeList(1, 2, 3);
    list.moveToBack(a!);
    assertEquals(list.remove(a!), true);
    assertList(list, [2, 3]);
    list.moveToBack(b!);
    assertList(list, [3, 2]);
    assertStrictEquals(list.popBack(), b);
    assertList(list, [3]);
  });
});

Deno.test("IntrusiveList.moveToBack() throws on a detached node", () => {
  const [list, [a]] = makeList(1, 2);
  list.remove(a!);
  for (const node of [a!, new Item(9)]) {
    assertThrows(
      () => list.moveToBack(node),
      TypeError,
      "Cannot move to back of IntrusiveList: node is not in this list",
    );
  }
  assertList(list, [2]);
});

Deno.test("IntrusiveList.moveToBack() throws on a node in another list", () => {
  const [first, [a, b]] = makeList(1, 2);
  const [second] = makeList(3);
  for (const node of [a!, b!]) {
    assertThrows(
      () => second.moveToBack(node),
      TypeError,
      "Cannot move to back of IntrusiveList: node is not in this list",
    );
  }
  assertList(first, [1, 2]);
  assertList(second, [3]);
});

Deno.test("IntrusiveList detached nodes can join another list", () => {
  const [first, [a, b, c]] = makeList(1, 2, 3);
  const second = new IntrusiveList<Item>();

  first.remove(b!);
  second.pushBack(b!);
  second.pushBack(first.popFront()!);
  second.pushBack(first.popBack()!);
  assertList(first, []);
  assertList(second, [2, 1, 3]);

  assertThrows(() => first.remove(a!), TypeError);
  assertEquals(second.remove(a!), true);
  first.pushBack(a!);
  assertList(first, [1]);
  assertList(second, [2, 3]);

  second.moveToBack(b!);
  assertList(second, [3, 2]);
  assertStrictEquals(second.peekFront(), c);
});

Deno.test("IntrusiveList accepts subclasses with their own private fields", () => {
  class Secret extends IntrusiveListNode {
    #value: number;
    constructor(value: number) {
      super();
      this.#value = value;
    }
    get value(): number {
      return this.#value;
    }
  }

  const list = new IntrusiveList<Secret>();
  const a = new Secret(1);
  const b = new Secret(2);
  list.pushBack(a);
  list.pushBack(b);
  list.moveToBack(a);
  assertEquals([...list].map((node) => node.value), [2, 1]);
});

Deno.test("IntrusiveList iterator is not destructive and is repeatable", () => {
  const [list] = makeList(1, 2, 3);
  assertEquals(ids(list), [1, 2, 3]);
  assertEquals(ids(list), [1, 2, 3]);
  assertEquals(list.length, 3);
});

Deno.test("IntrusiveList iterator follows the iterator protocol", () => {
  const [list, [a]] = makeList(1);
  const it = list[Symbol.iterator]();
  assertStrictEquals(it[Symbol.iterator](), it);

  const b = new Item(2);
  list.pushBack(b);
  assertEquals(it.next(), { done: false, value: a! });
  assertEquals(it.next(), { done: false, value: b });
  assertEquals(it.next(), { done: true, value: undefined });

  list.pushBack(new Item(3));
  assertEquals(it.next(), { done: true, value: undefined });
  assertEquals(new IntrusiveList<Item>()[Symbol.iterator]().next(), {
    done: true,
    value: undefined,
  });
});

Deno.test("IntrusiveList iterator stays finite when the list changes mid-iteration", async (t) => {
  await t.step("removing the current node", () => {
    const [list] = makeList(1, 2, 3, 4);
    const seen: number[] = [];
    for (const item of list) {
      seen.push(item.id);
      if (item.id % 2 === 0) list.remove(item);
    }
    assertEquals(seen, [1, 2, 3, 4]);
    assertList(list, [1, 3]);
  });
  await t.step("moving every node to the back", () => {
    const [list] = makeList(1, 2, 3);
    let steps = 0;
    for (const item of list) {
      list.moveToBack(item);
      if (++steps > 10) break;
    }
    assertEquals(steps < 10, true);
    assertList(list, [2, 3, 1]);
  });
  await t.step("moving the next node into another list", () => {
    const [list, [, b]] = makeList(1, 2, 3);
    const [other] = makeList(8, 9);
    const seen: number[] = [];
    for (const item of list) {
      seen.push(item.id);
      if (item.id === 1) {
        list.remove(b!);
        other.pushBack(b!);
      }
    }
    assertEquals(seen.includes(8), false);
    assertEquals(seen.includes(9), false);
    assertList(list, [1, 3]);
    assertList(other, [8, 9, 2]);
  });
  await t.step("clearing the list", () => {
    const [list] = makeList(1, 2, 3);
    const seen: number[] = [];
    for (const item of list) {
      seen.push(item.id);
      while (list.popFront() !== undefined);
    }
    assertEquals(seen, [1]);
    assertList(list, []);
  });
});

/** Mulberry32: deterministic 32-bit PRNG for reproducible stress tests. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

Deno.test("IntrusiveList matches an array model under random operations", () => {
  const rand = mulberry32(51);
  const pick = <T>(values: readonly T[]): T =>
    values[Math.floor(rand() * values.length)]!;

  const lists = [new IntrusiveList<Item>(), new IntrusiveList<Item>()];
  const models: Item[][] = [[], []];
  const pool = Array.from({ length: 24 }, (_, i) => new Item(i));
  const ownerOf = (item: Item) => models.findIndex((m) => m.includes(item));

  for (let step = 0; step < 5000; step++) {
    const which = Math.floor(rand() * 2);
    const list = lists[which]!;
    const model = models[which]!;
    const item = pick(pool);
    const owner = ownerOf(item);
    const op = pick(
      ["pushBack", "popFront", "popBack", "remove", "moveToBack"] as const,
    );

    switch (op) {
      case "pushBack":
        if (owner === -1) {
          list.pushBack(item);
          model.push(item);
        } else {
          assertThrows(() => list.pushBack(item), TypeError);
        }
        break;
      case "popFront":
        assertStrictEquals(list.popFront(), model.shift());
        break;
      case "popBack":
        assertStrictEquals(list.popBack(), model.pop());
        break;
      case "remove":
        if (owner === which) {
          assertEquals(list.remove(item), true);
          model.splice(model.indexOf(item), 1);
        } else if (owner === -1) {
          assertEquals(list.remove(item), false);
        } else {
          assertThrows(() => list.remove(item), TypeError);
        }
        break;
      case "moveToBack":
        if (owner === which) {
          list.moveToBack(item);
          model.splice(model.indexOf(item), 1);
          model.push(item);
        } else {
          assertThrows(() => list.moveToBack(item), TypeError);
        }
        break;
    }

    for (let i = 0; i < 2; i++) {
      assertEquals(lists[i]!.length, models[i]!.length);
      assertEquals([...lists[i]!], models[i]!);
      assertStrictEquals(lists[i]!.peekFront(), models[i]![0]);
      assertStrictEquals(lists[i]!.peekBack(), models[i]!.at(-1));
    }
  }
});
