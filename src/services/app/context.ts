import assert from "node:assert";
import { type Context } from "../command/context.js";
import type { Application, Environment } from "./app.js";

const kApp = Symbol.for("app");
const kEnv = Symbol.for("env");

export const maybeGetCurrentApp = (ctx: Context): Application | undefined => {
  return ctx.get(kApp) as Application | undefined;
};

export const getCurrentApp = (ctx: Context): Application => {
  const app = maybeGetCurrentApp(ctx);
  assert(app, "missing app in context");
  return app;
};

export const setCurrentApp = (ctx: Context, app: Application): void => {
  ctx.set(kApp, app);
};

export const maybeGetCurrentEnv = (ctx: Context): Environment | undefined => {
  return ctx.get(kEnv) as Environment | undefined;
};

export const getCurrentEnv = (ctx: Context): Environment => {
  const env = maybeGetCurrentEnv(ctx);
  assert(env, "missing env in context");
  return env;
};

export const setCurrentEnv = (ctx: Context, env: Environment): void => {
  ctx.set(kEnv, env);
};
