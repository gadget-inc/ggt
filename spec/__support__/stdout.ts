import { expect, type Assertion } from "vitest";

export const testStdout: string[] = [];

export const expectStdout = (): Assertion<string> => expect(testStdout.join(""));
