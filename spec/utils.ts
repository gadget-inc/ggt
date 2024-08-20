/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable func-style */

import nock from "nock";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { config } from "../src/services/config/config.js";
import { readToken } from "../src/services/user/session.js";
import { nockTestApps, testApp, testApp2, testAppWith0Environments, testAppWith2Environments } from "./__support__/app.js";
import { testCtx } from "./__support__/context.js";
import { loginTestUser, testUser } from "./__support__/user.js";

export const describeWithAuth = createWithAuthSuite();

type AuthContext = {
  cookies: boolean;
  tokens: boolean;
};

type ChainableWithAuthSuiteApi = ChainableFunction<"cookies" | "tokens", (fn: () => void) => void>;

export type WithAuthSuiteApi = ChainableWithAuthSuiteApi;

function createWithAuthSuite() {
  function suiteFn(this: AuthContext, fn: () => void) {
    if (this.cookies) {
      return describeWithCookieAuth(fn);
    }

    if (this.tokens) {
      return describeWithTokenAuth(fn);
    }

    // randomly pick an auth method
    const useCookiesAuth = Math.random() < 0.5;
    if (useCookiesAuth) {
      return describeWithCookieAuth(fn);
    } else {
      return describeWithTokenAuth(fn);
    }
  }

  return createChainable(["cookies", "tokens"], suiteFn) as unknown as WithAuthSuiteApi;
}

const describeWithTokenAuth = (fn: () => void) =>
  describe("with token authentication", () => {
    beforeEach(() => {
      vi.stubEnv("GGT_TOKEN", "gpat-test-token");

      nock(`https://${config.domains.services}`)
        .get("/auth/api/current-user")
        .matchHeader("x-platform-access-token", (value) => {
          const token = readToken(testCtx);
          return value === token;
        })
        .optionally(false)
        .reply(200, testUser)
        .persist();

      nock(`https://${config.domains.services}`)
        .get("/auth/api/apps")
        .optionally(false)
        .matchHeader("x-platform-access-token", (value) => {
          const token = readToken(testCtx);
          return value === token;
        })
        .reply(200, [testApp, testApp2, testAppWith2Environments, testAppWith0Environments])
        .persist();
    });

    afterEach(() => {
      expect(nock.pendingMocks()).toEqual([]);
    });

    fn();
  });

const describeWithCookieAuth = (fn: () => void) =>
  describe("with cookie authentication", () => {
    beforeEach(() => {
      loginTestUser();
      nockTestApps();
    });

    afterEach(() => {
      expect(nock.pendingMocks()).toEqual([]);
    });

    fn();
  });

// Very much taken from vitest's own `createChainable` function - packages/runner/src/utils/chain.ts
// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/ban-types
export type ChainableFunction<T extends string, F extends (...args: any) => any, C = {}> = F & {
  [x in T]: ChainableFunction<T, F, C>;
} & {
  fn: (this: Record<T, any>, ...args: Parameters<F>) => ReturnType<F>;
} & C;

// eslint-disable-next-line func-style, jsdoc/require-jsdoc
export function createChainable<T extends string, Args extends any[], R = any>(
  keys: T[],
  fn: (this: Record<T, any>, ...args: Args) => R,
): ChainableFunction<T, (...args: Args) => R> {
  // eslint-disable-next-line func-style, @typescript-eslint/explicit-function-return-type
  function create(context: Record<T, any>) {
    const chain = function (this: any, ...args: Args) {
      return fn.apply(context, args);
    };
    Object.assign(chain, fn);
    chain.withContext = () => chain.bind(context);
    chain.setContext = (key: T, value: any) => {
      context[key] = value;
    };
    chain.mergeContext = (ctx: Record<T, any>) => {
      Object.assign(context, ctx);
    };
    for (const key of keys) {
      Object.defineProperty(chain, key, {
        get() {
          return create({ ...context, [key]: true });
        },
      });
    }
    return chain;
  }

  const chain = create({} as any) as any;
  chain.fn = fn;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return chain;
}
