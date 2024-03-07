import { assert, beforeEach, expect, vi, type SpyInstance } from "vitest";
import * as confirm from "../../src/services/output/confirm.js";
import { output } from "../../src/services/output/output.js";
import * as select from "../../src/services/output/select.js";
import { isSprintOptions, sprint, sprintln, type SprintOptions } from "../../src/services/output/sprint.js";
import { noop } from "../../src/services/util/function.js";
import { isString } from "../../src/services/util/is.js";
import type { ArgsType, FunctionPropertyNames } from "../../src/services/util/types.js";
import { printStackTraceAndFail } from "./debug.js";

export type Mock = {
  /**
   * Replaces a mocked function with a new implementation. If the
   * function is not already mocked, this will throw an error.
   *
   * @param fn - The mocked function.
   * @param impl - The implementation to use.
   */
  <Fn extends (...args: any[]) => any, Impl extends (...args: Parameters<Fn>) => ReturnType<Fn> | Awaited<ReturnType<Fn>>>(
    fn: Fn,
    impl: Impl,
  ): SpyInstance<ArgsType<Fn>, ReturnType<Fn>>;

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
    Impl extends (...args: Parameters<Fn>) => ReturnType<Fn> | Awaited<ReturnType<Fn>>,
  >(
    target: Target,
    property: Property,
    impl: Impl,
  ): SpyInstance<ArgsType<Fn>, ReturnType<Fn>>;

  /**
   * Mocks a getter on an object. If the getter is already mocked,
   * it will be replaced with the new implementation.
   *
   * @param target - The object to mock.
   * @param property - The property to mock.
   * @param accessor - The accessor to mock.
   * @param impl - The implementation to use.
   */
  <Target extends object, Property extends keyof Target, Field extends Target[Property], Impl extends () => Field>(
    target: Target,
    property: Property,
    accessor: "get",
    impl: Impl,
  ): SpyInstance<[], Property>;

  /**
   * Mocks a setter on an object. If the setter is already mocked,
   * it will be replaced with the new implementation.
   *
   * @param target - The object to mock.
   * @param property - The property to mock.
   * @param accessor - The accessor to mock.
   * @param impl - The implementation to use.
   */
  <Target extends object, Property extends keyof Target, Field extends Target[Property], Impl extends (value: Field) => void>(
    target: Target,
    property: Property,
    accessor: "set",
    impl: Impl,
  ): SpyInstance<[Property], void>;
};

/**
 * Mocks a function.
 *
 * @see {@linkcode Mock}
 */
export const mock = ((target: any, property: any, accessor: any, impl: any) => {
  let mocked: SpyInstance;

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
  let mocked: SpyInstance;

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
  vi.mock("which", () => ({ default: { sync: vi.fn().mockName("whichSync").mockReturnValue("/path/to/yarn") } }));
  vi.mock("simple-git", () => ({
    simpleGit: vi
      .fn()
      .mockName("simpleGit")
      .mockReturnValue({
        revparse: vi.fn().mockName("revparse").mockResolvedValue("test-branch"),
      }),
  }));

  // we mock figures to always return the main symbols rather than the
  // fallback ones so that our tests are consistent across platforms
  // (particularly Windows)
  vi.mock("figures", async () => {
    const { mainSymbols } = await vi.importActual("figures");
    return { default: mainSymbols };
  });

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

export const mockConfirm = (impl = noop): SpyInstance<[options: SprintOptions], confirm.confirm> => {
  const mockedConfirm = (optionsOrStr: any, ...values: unknown[]): any => {
    if (isSprintOptions(optionsOrStr)) {
      return mockedConfirm;
    }
    if (!isString(optionsOrStr)) {
      optionsOrStr = sprint(optionsOrStr, ...values);
    }
    // TODO: this is actually printed to stderr
    output.writeStdout(optionsOrStr);
    impl();
  };

  return mock(confirm, "confirm", mockedConfirm);
};

export const mockConfirmOnce = (impl = noop): SpyInstance<[options: SprintOptions], confirm.confirm> => {
  let options: SprintOptions = {
    ensureEmptyLineAbove: true,
  };

  const mockedConfirm = (optionsOrStr: any, ...values: unknown[]): any => {
    if (isSprintOptions(optionsOrStr)) {
      options = { ...options, ...optionsOrStr };
      return mockedConfirm;
    }
    if (!isString(optionsOrStr)) {
      optionsOrStr = sprintln(options)(optionsOrStr, ...values);
    }
    // TODO: this is actually printed to stderr
    output.writeStdout(optionsOrStr);
    impl();
  };

  return mockOnce(confirm, "confirm", mockedConfirm);
};

export const mockSelect = <Choice extends string>(
  choice: Choice,
): SpyInstance<[options: select.SelectOptions<string>], select.selectWithChoices<string>> => {
  return mock(select, "select", (_options) => {
    return (_str) => {
      return Promise.resolve(choice);
    };
  });
};

export const mockSelectOnce = <Choice extends string>(
  choice: Choice,
): SpyInstance<[options: select.SelectOptions<string>], select.selectWithChoices<string>> => {
  return mockOnce(select, "select", (_options) => {
    return (_str) => {
      return Promise.resolve(choice);
    };
  });
};
