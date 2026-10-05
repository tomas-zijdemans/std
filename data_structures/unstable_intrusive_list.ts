// Copyright 2018-2026 the Deno authors. MIT license.
// This module is browser compatible.

// Accessors for the node's private fields, assigned in its static block.
let getPrev!: (node: IntrusiveListNode) => IntrusiveListNode | undefined;
let getNext!: (node: IntrusiveListNode) => IntrusiveListNode | undefined;
let getList!: (node: IntrusiveListNode) => object | undefined;
let setPrev!: (
  node: IntrusiveListNode,
  prev: IntrusiveListNode | undefined,
) => void;
let setNext!: (
  node: IntrusiveListNode,
  next: IntrusiveListNode | undefined,
) => void;
let attach!: (
  node: IntrusiveListNode,
  list: object,
  prev: IntrusiveListNode | undefined,
) => void;
let detach!: (node: IntrusiveListNode) => void;

/**
 * Base class for members of an {@linkcode IntrusiveList}. Extend it to make a
 * class storable in a list. It has no public members: the links and the
 * owning list live in private fields that only `IntrusiveList` can reach.
 *
 * A node belongs to at most one list at a time. A node in no list is
 * detached, and a detached node can be added to any list.
 *
 * @experimental **UNSTABLE**: New API, yet to be vetted.
 *
 * @example Usage
 * ```ts
 * import {
 *   IntrusiveList,
 *   IntrusiveListNode,
 * } from "@std/data-structures/unstable-intrusive-list";
 * import { assertEquals } from "@std/assert";
 *
 * class Task extends IntrusiveListNode {
 *   constructor(readonly name: string) {
 *     super();
 *   }
 * }
 *
 * const list = new IntrusiveList<Task>();
 * list.pushBack(new Task("a"));
 * assertEquals(list.peekFront()?.name, "a");
 * ```
 */
export class IntrusiveListNode {
  #prev: IntrusiveListNode | undefined = undefined;
  #next: IntrusiveListNode | undefined = undefined;
  /** The owning list. `undefined` exactly when the node is detached. */
  #list: object | undefined = undefined;

  static {
    getPrev = (node) => node.#prev;
    getNext = (node) => node.#next;
    getList = (node) => node.#list;
    setPrev = (node, prev) => {
      node.#prev = prev;
    };
    setNext = (node, next) => {
      node.#next = next;
    };
    attach = (node, list, prev) => {
      node.#list = list;
      node.#prev = prev;
      node.#next = undefined;
    };
    detach = (node) => {
      node.#list = undefined;
      node.#prev = undefined;
      node.#next = undefined;
    };
  }
}

/**
 * A doubly linked list that stores its links on the nodes themselves. A
 * caller that holds a node can remove it or move it to the back in constant
 * time, without searching the list.
 *
 * Nodes are instances of a class that extends {@linkcode IntrusiveListNode}.
 * Each node records which list it is in, so passing a node that belongs to a
 * different list throws a `TypeError` instead of corrupting either list.
 * Removing a detached node returns `false`, which lets cancellation
 * paths call {@linkcode IntrusiveList.prototype.remove | remove} without
 * checking first.
 *
 * | Method            | Time complexity                 |
 * | ----------------- | ------------------------------- |
 * | length            | Constant                        |
 * | peekFront()       | Constant                        |
 * | peekBack()        | Constant                        |
 * | pushBack()        | Constant                        |
 * | popFront()        | Constant                        |
 * | popBack()         | Constant                        |
 * | remove()          | Constant                        |
 * | moveToBack()      | Constant                        |
 * | [Symbol.iterator] | Linear in the number of nodes   |
 *
 * The iterator follows links lazily. Mutating the list during iteration
 * leaves the list consistent, but which nodes are visited is unspecified.
 * Copy the nodes into an array first if the loop body changes the list.
 *
 * @experimental **UNSTABLE**: New API, yet to be vetted.
 *
 * @example Usage
 * ```ts
 * import {
 *   IntrusiveList,
 *   IntrusiveListNode,
 * } from "@std/data-structures/unstable-intrusive-list";
 * import { assertEquals } from "@std/assert";
 *
 * class Waiter extends IntrusiveListNode {
 *   constructor(readonly id: number) {
 *     super();
 *   }
 * }
 *
 * const queue = new IntrusiveList<Waiter>();
 * const a = new Waiter(1);
 * const b = new Waiter(2);
 * const c = new Waiter(3);
 * queue.pushBack(a);
 * queue.pushBack(b);
 * queue.pushBack(c);
 *
 * assertEquals(queue.remove(b), true);
 * assertEquals(queue.remove(b), false);
 * assertEquals(queue.popFront(), a);
 * assertEquals([...queue], [c]);
 * ```
 *
 * @typeParam T The type of the nodes, a subclass of
 *   {@linkcode IntrusiveListNode}.
 */
export class IntrusiveList<T extends IntrusiveListNode> implements Iterable<T> {
  #head: T | undefined = undefined;
  #tail: T | undefined = undefined;
  #length = 0;

  /**
   * The number of nodes in the list.
   *
   * @experimental **UNSTABLE**: New API, yet to be vetted.
   *
   * @example Getting the length
   * ```ts
   * import {
   *   IntrusiveList,
   *   IntrusiveListNode,
   * } from "@std/data-structures/unstable-intrusive-list";
   * import { assertEquals } from "@std/assert";
   *
   * const list = new IntrusiveList<IntrusiveListNode>();
   * list.pushBack(new IntrusiveListNode());
   * list.pushBack(new IntrusiveListNode());
   * assertEquals(list.length, 2);
   * ```
   *
   * @returns The number of nodes in the list.
   */
  get length(): number {
    return this.#length;
  }

  /**
   * Returns the first node without removing it.
   *
   * @experimental **UNSTABLE**: New API, yet to be vetted.
   *
   * @example Peeking at the front
   * ```ts
   * import {
   *   IntrusiveList,
   *   IntrusiveListNode,
   * } from "@std/data-structures/unstable-intrusive-list";
   * import { assertEquals } from "@std/assert";
   *
   * const list = new IntrusiveList<IntrusiveListNode>();
   * assertEquals(list.peekFront(), undefined);
   *
   * const node = new IntrusiveListNode();
   * list.pushBack(node);
   * list.pushBack(new IntrusiveListNode());
   * assertEquals(list.peekFront(), node);
   * assertEquals(list.length, 2);
   * ```
   *
   * @returns The first node, or `undefined` if the list is empty.
   */
  peekFront(): T | undefined {
    return this.#head;
  }

  /**
   * Returns the last node without removing it.
   *
   * @experimental **UNSTABLE**: New API, yet to be vetted.
   *
   * @example Peeking at the back
   * ```ts
   * import {
   *   IntrusiveList,
   *   IntrusiveListNode,
   * } from "@std/data-structures/unstable-intrusive-list";
   * import { assertEquals } from "@std/assert";
   *
   * const list = new IntrusiveList<IntrusiveListNode>();
   * assertEquals(list.peekBack(), undefined);
   *
   * const node = new IntrusiveListNode();
   * list.pushBack(new IntrusiveListNode());
   * list.pushBack(node);
   * assertEquals(list.peekBack(), node);
   * assertEquals(list.length, 2);
   * ```
   *
   * @returns The last node, or `undefined` if the list is empty.
   */
  peekBack(): T | undefined {
    return this.#tail;
  }

  /**
   * Appends a node to the back of the list.
   *
   * @experimental **UNSTABLE**: New API, yet to be vetted.
   *
   * @example Appending nodes
   * ```ts
   * import {
   *   IntrusiveList,
   *   IntrusiveListNode,
   * } from "@std/data-structures/unstable-intrusive-list";
   * import { assertEquals } from "@std/assert";
   *
   * const list = new IntrusiveList<IntrusiveListNode>();
   * const a = new IntrusiveListNode();
   * const b = new IntrusiveListNode();
   * list.pushBack(a);
   * list.pushBack(b);
   * assertEquals([...list], [a, b]);
   * ```
   *
   * @example Appending a node that is already in a list
   * ```ts
   * import {
   *   IntrusiveList,
   *   IntrusiveListNode,
   * } from "@std/data-structures/unstable-intrusive-list";
   * import { assertThrows } from "@std/assert";
   *
   * const first = new IntrusiveList<IntrusiveListNode>();
   * const second = new IntrusiveList<IntrusiveListNode>();
   * const node = new IntrusiveListNode();
   * first.pushBack(node);
   *
   * assertThrows(() => first.pushBack(node), TypeError);
   * assertThrows(() => second.pushBack(node), TypeError);
   * ```
   *
   * @param node The node to append. It must be detached.
   * @throws {TypeError} If `node` is already in this or another list.
   */
  pushBack(node: T): void {
    if (getList(node) !== undefined) {
      throw new TypeError(
        "Cannot push into IntrusiveList: node is already in a list",
      );
    }
    const tail = this.#tail;
    attach(node, this, tail);
    if (tail === undefined) this.#head = node;
    else setNext(tail, node);
    this.#tail = node;
    this.#length++;
  }

  /**
   * Removes and returns the first node. The node is detached and can be
   * added to any list again.
   *
   * @experimental **UNSTABLE**: New API, yet to be vetted.
   *
   * @example Popping from the front
   * ```ts
   * import {
   *   IntrusiveList,
   *   IntrusiveListNode,
   * } from "@std/data-structures/unstable-intrusive-list";
   * import { assertEquals } from "@std/assert";
   *
   * const list = new IntrusiveList<IntrusiveListNode>();
   * const a = new IntrusiveListNode();
   * const b = new IntrusiveListNode();
   * list.pushBack(a);
   * list.pushBack(b);
   *
   * assertEquals(list.popFront(), a);
   * assertEquals([...list], [b]);
   * ```
   *
   * @returns The first node, or `undefined` if the list is empty.
   */
  popFront(): T | undefined {
    const node = this.#head;
    if (node !== undefined) this.#unlink(node);
    return node;
  }

  /**
   * Removes and returns the last node. The node is detached and can be added
   * to any list again.
   *
   * @experimental **UNSTABLE**: New API, yet to be vetted.
   *
   * @example Popping from the back
   * ```ts
   * import {
   *   IntrusiveList,
   *   IntrusiveListNode,
   * } from "@std/data-structures/unstable-intrusive-list";
   * import { assertEquals } from "@std/assert";
   *
   * const list = new IntrusiveList<IntrusiveListNode>();
   * const a = new IntrusiveListNode();
   * const b = new IntrusiveListNode();
   * list.pushBack(a);
   * list.pushBack(b);
   *
   * assertEquals(list.popBack(), b);
   * assertEquals([...list], [a]);
   * ```
   *
   * @returns The last node, or `undefined` if the list is empty.
   */
  popBack(): T | undefined {
    const node = this.#tail;
    if (node !== undefined) this.#unlink(node);
    return node;
  }

  /**
   * Removes a node from the list. The node is detached and can be added to
   * any list again.
   *
   * A detached node is left unchanged and the call returns `false`, so a
   * cancellation handler can tell whether the node was still waiting.
   *
   * @experimental **UNSTABLE**: New API, yet to be vetted.
   *
   * @example Removing a node from the middle
   * ```ts
   * import {
   *   IntrusiveList,
   *   IntrusiveListNode,
   * } from "@std/data-structures/unstable-intrusive-list";
   * import { assertEquals } from "@std/assert";
   *
   * const list = new IntrusiveList<IntrusiveListNode>();
   * const a = new IntrusiveListNode();
   * const b = new IntrusiveListNode();
   * const c = new IntrusiveListNode();
   * list.pushBack(a);
   * list.pushBack(b);
   * list.pushBack(c);
   *
   * assertEquals(list.remove(b), true);
   * assertEquals([...list], [a, c]);
   * ```
   *
   * @example Removing a detached node
   * ```ts
   * import {
   *   IntrusiveList,
   *   IntrusiveListNode,
   * } from "@std/data-structures/unstable-intrusive-list";
   * import { assertEquals } from "@std/assert";
   *
   * const list = new IntrusiveList<IntrusiveListNode>();
   * const node = new IntrusiveListNode();
   * list.pushBack(node);
   * list.popFront();
   *
   * assertEquals(list.remove(node), false);
   * ```
   *
   * @param node The node to remove.
   * @returns `true` if the node was removed, or `false` if it was detached.
   * @throws {TypeError} If `node` is in another list.
   */
  remove(node: T): boolean {
    const owner = getList(node);
    if (owner === undefined) return false;
    if (owner !== this) {
      throw new TypeError(
        "Cannot remove from IntrusiveList: node is in another list",
      );
    }
    this.#unlink(node);
    return true;
  }

  /**
   * Moves a node to the back of the list. Does nothing if the node is
   * already last.
   *
   * @experimental **UNSTABLE**: New API, yet to be vetted.
   *
   * @example Moving a node to the back
   * ```ts
   * import {
   *   IntrusiveList,
   *   IntrusiveListNode,
   * } from "@std/data-structures/unstable-intrusive-list";
   * import { assertEquals } from "@std/assert";
   *
   * const list = new IntrusiveList<IntrusiveListNode>();
   * const a = new IntrusiveListNode();
   * const b = new IntrusiveListNode();
   * const c = new IntrusiveListNode();
   * list.pushBack(a);
   * list.pushBack(b);
   * list.pushBack(c);
   *
   * list.moveToBack(a);
   * assertEquals([...list], [b, c, a]);
   * ```
   *
   * @param node The node to move. It must be in this list.
   * @throws {TypeError} If `node` is not in this list.
   */
  moveToBack(node: T): void {
    if (getList(node) !== this) {
      throw new TypeError(
        "Cannot move to back of IntrusiveList: node is not in this list",
      );
    }
    const tail = this.#tail!;
    if (node === tail) return;
    const prev = getPrev(node) as T | undefined;
    const next = getNext(node) as T;
    if (prev === undefined) this.#head = next;
    else setNext(prev, next);
    setPrev(next, prev);
    setPrev(node, tail);
    setNext(node, undefined);
    setNext(tail, node);
    this.#tail = node;
  }

  /**
   * Iterates over the nodes from front to back, without removing them.
   *
   * @experimental **UNSTABLE**: New API, yet to be vetted.
   *
   * @example Iterating over the list
   * ```ts
   * import {
   *   IntrusiveList,
   *   IntrusiveListNode,
   * } from "@std/data-structures/unstable-intrusive-list";
   * import { assertEquals } from "@std/assert";
   *
   * class Item extends IntrusiveListNode {
   *   constructor(readonly value: number) {
   *     super();
   *   }
   * }
   *
   * const list = new IntrusiveList<Item>();
   * for (const value of [1, 2, 3]) list.pushBack(new Item(value));
   *
   * assertEquals([...list].map((item) => item.value), [1, 2, 3]);
   * ```
   *
   * @returns An iterator yielding nodes from front to back.
   */
  [Symbol.iterator](): IterableIterator<T> {
    return new IntrusiveListIterator(this);
  }

  /** Splices out a node known to be in this list and detaches it. */
  #unlink(node: T): void {
    const prev = getPrev(node) as T | undefined;
    const next = getNext(node) as T | undefined;
    if (prev === undefined) this.#head = next;
    else setNext(prev, next);
    if (next === undefined) this.#tail = prev;
    else setPrev(next, prev);
    detach(node);
    this.#length--;
  }
}

/** Front-to-back iterator returned by {@linkcode IntrusiveList}. */
class IntrusiveListIterator<T extends IntrusiveListNode>
  implements IterableIterator<T> {
  /** The list being walked, or `undefined` once iteration is done. */
  #list: IntrusiveList<T> | undefined;
  /** The node returned last, or `undefined` before the first call. */
  #current: T | undefined = undefined;
  /** The successor of `#current` when it was returned. */
  #saved: IntrusiveListNode | undefined = undefined;

  constructor(list: IntrusiveList<T>) {
    this.#list = list;
  }

  next(): IteratorResult<T, undefined> {
    const list = this.#list;
    if (list === undefined) return { done: true, value: undefined };
    const current = this.#current;
    let node: IntrusiveListNode | undefined;
    if (current === undefined) {
      node = list.peekFront();
    } else {
      // A removed node has lost its links, so resume from its old successor.
      // Never follow a link into another list.
      node = getList(current) === list ? getNext(current) : this.#saved;
      if (node !== undefined && getList(node) !== list) node = undefined;
    }
    if (node === undefined) {
      this.#list = undefined;
      this.#current = undefined;
      this.#saved = undefined;
      return { done: true, value: undefined };
    }
    this.#current = node as T;
    this.#saved = getNext(node);
    return { done: false, value: node as T };
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this;
  }
}
