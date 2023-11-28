// https://vitest.dev/config/#globalsetup

export const setup = (): void => {
  process.env.TZ = "UTC"; // so that we get predictable output in tests
};
