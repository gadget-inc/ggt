import { assert, beforeEach, expect, vi, type MockInstance } from "vitest";

import type { FunctionPropertyNames } from "../../src/services/util/types.js";

import * as confirm from "../../src/services/output/confirm.js";
import { output } from "../../src/services/output/output.js";
import * as select from "../../src/services/output/select.js";
import { sprintln } from "../../src/services/output/sprint.js";
import { noop } from "../../src/services/util/function.js";
import { printStackTraceAndFail } from "./debug.js";

export type Mock = {
  /**
   * Replaces a mocked function with a new implementation. If the
   * function is not already mocked, this will throw an error.
   *
   * @param fn - The mocked function.
   * @param impl - The implementation to use.
   */
  <Fn extends (...args: any[]) => any>(
    fn: Fn,
    impl: (...args: Parameters<Fn>) => ReturnType<Fn> | Awaited<ReturnType<Fn>>,
  ): MockInstance<Fn>;

  /**
   * Mocks a method on an object. If the method is already mocked,
   * it will be replaced with the new implementation.
   *
   * @param target - The object to mock.
   * @param property - The property to mock.
   * @param impl - The implementation to use.
   */
  <
    Target extends object,
    Property extends FunctionPropertyNames<Target>,
    Fn extends Target[Property] extends (...args: any[]) => any ? Target[Property] : never,
  >(
    target: Target,
    property: Property,
    impl: (...args: Parameters<Fn>) => ReturnType<Fn> | Awaited<ReturnType<Fn>>,
  ): MockInstance<Fn>;

  /**
   * Mocks a getter on an object. If the getter is already mocked,
   * it will be replaced with the new implementation.
   *
   * @param target - The object to mock.
   * @param property - The property to mock.
   * @param accessor - The accessor to mock.
   * @param impl - The implementation to use.
   */
  <Target extends object, Property extends keyof Target, Field extends Target[Property]>(
    target: Target,
    property: Property,
    accessor: "get",
    impl: () => Field,
  ): MockInstance<() => Field>;

  /**
   * Mocks a setter on an object. If the setter is already mocked,
   * it will be replaced with the new implementation.
   *
   * @param target - The object to mock.
   * @param property - The property to mock.
   * @param accessor - The accessor to mock.
   * @param impl - The implementation to use.
   */
  <Target extends object, Property extends keyof Target, Field extends Target[Property]>(
    target: Target,
    property: Property,
    accessor: "set",
    impl: (value: Field) => void,
  ): MockInstance<(value: Field) => void>;
};

/**
 * Mocks a function.
 *
 * @see {@linkcode Mock}
 */
export const mock = ((target: any, property: any, accessor: any, impl: any) => {
  let mocked: MockInstance;

  if (impl) {
    // (target, property, accessor, value)
    expect(target).toHaveProperty(property);
    expect(["get", "set"]).toContain(accessor);
    expect(impl).toBeInstanceOf(Function);

    mockRestore(target[property]);
    mocked = vi.spyOn(target, property, accessor).mockImplementation(impl);
  } else if (accessor) {
    // (target, property, impl)
    impl = accessor;
    expect(target).toHaveProperty(property);
    expect(impl).toBeInstanceOf(Function);

    mockRestore(target[property]);
    mocked = vi.spyOn(target, property).mockImplementation(impl);
  } else {
    // (fn, impl)

    impl = property;
    assert(vi.isMockFunction(target), "expected mocked function");
    expect(impl).toBeInstanceOf(Function);

    target.mockClear();
    target.mockImplementation(impl);
    mocked = target;
  }

  return mocked;
}) as unknown as Mock;

/**
 * The same as {@linkcode mock}, but only mocks the function once.
 *
 * @see {@linkcode Mock}
 */
export const mockOnce = ((target: any, property: any, accessor: any, impl: any) => {
  let mocked: MockInstance;

  if (impl) {
    // (target, property, accessor, value)
    expect(target).toHaveProperty(property);
    expect(["get", "set"]).toContain(accessor);
    expect(impl).toBeInstanceOf(Function);

    mocked = vi.spyOn(target, property, accessor).mockImplementationOnce(impl);
  } else if (accessor) {
    // (target, property, impl)
    impl = accessor;
    expect(target).toHaveProperty(property);
    expect(impl).toBeInstanceOf(Function);

    mocked = vi.spyOn(target, property).mockImplementationOnce(impl);
  } else {
    // (fn, impl)
    impl = property;
    assert(vi.isMockFunction(target), "expected mocked function");
    expect(impl).toBeInstanceOf(Function);

    target.mockImplementationOnce(impl);
    mocked = target;
  }

  return mocked;
}) as unknown as Mock;

/**
 * Restores a mocked function to its original implementation. If the
 * function is not already mocked, this will not do anything.
 *
 * @param fn - The mocked function.
 */
export const mockRestore = (fn: unknown): void => {
  if (vi.isMockFunction(fn)) {
    fn.mockRestore();
  }
};

export const mockSideEffects = (): void => {
  // mock these dependencies with consistent/no-op implementations
  vi.mock("execa", () => ({ execa: vi.fn().mockName("execa").mockResolvedValue({}) }));
  vi.mock("get-port", () => ({ default: vi.fn().mockName("getPort").mockResolvedValue(1234) }));
  vi.mock("node-notifier", () => ({ default: { notify: vi.fn().mockName("notify") } }));
  vi.mock("open", () => ({ default: vi.fn().mockName("open") }));
  vi.mock("which", () => ({ default: vi.fn().mockName("which").mockResolvedValue("/path/to/yarn") }));
  vi.mock("simple-git", () => ({
    simpleGit: vi
      .fn()
      .mockName("simpleGit")
      .mockReturnValue({
        revparse: vi.fn().mockName("revparse").mockResolvedValue("test-branch"),
        init: vi.fn().mockName("init").mockResolvedValue(undefined),
        add: vi.fn().mockName("add").mockResolvedValue(undefined),
        commit: vi.fn().mockName("commit").mockResolvedValue(undefined),
      }),
  }));

  beforeEach(() => {
    // alway opt in to process.exit
    mock(process, "exit", () => {
      printStackTraceAndFail(sprintln`
        process.exit was called unexpectedly.

        If you expected process.exit to be called, use expectProcessExit(() => fn()) instead.
      `);
    });
  });
};

export const mockConfirm = (answer = true, impl = noop): MockInstance<confirm.confirm> => {
  return mock(confirm, "confirm", (maybeOptions) => {
    const options = typeof maybeOptions === "string" ? { content: maybeOptions } : maybeOptions;
    // TODO: this is actually printed to stderr
    output.writeStdout(sprintln({ ensureEmptyLineAbove: true, ...options }));
    impl();
    return Promise.resolve(answer);
  });
};

export const mockConfirmOnce = (answer = true, impl = noop): MockInstance<confirm.confirm> => {
  return mockOnce(confirm, "confirm", (maybeOptions) => {
    const options = typeof maybeOptions === "string" ? { content: maybeOptions } : maybeOptions;
    // TODO: this is actually printed to stderr
    output.writeStdout(sprintln({ ensureEmptyLineAbove: true, ...options }));
    impl();
    return Promise.resolve(answer);
  });
};

export const mockSelect = (choice: string): MockInstance<select.select> => {
  return mock(select, "select", () => Promise.resolve(choice));
};

export const mockSelectOnce = (choice: string): MockInstance<select.select> => {
  return mockOnce(select, "select", () => Promise.resolve(choice));
};
