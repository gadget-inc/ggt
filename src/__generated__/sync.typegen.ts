// This file was automatically generated. Edits will be overwritten

export interface Typegen0 {
  "@@xstate/typegen": true;
  internalEvents: {
    "xstate.init": { type: "xstate.init" };
    "done.invoke.start": { type: "done.invoke.start"; data: unknown; __tip: "See the XState TS docs to learn how to strongly type this." };
    "error.platform.start": { type: "error.platform.start"; data: unknown };
    "done.invoke.setup": { type: "done.invoke.setup"; data: unknown; __tip: "See the XState TS docs to learn how to strongly type this." };
    "error.platform.setup": { type: "error.platform.setup"; data: unknown };
    "done.invoke.watch": { type: "done.invoke.watch"; data: unknown; __tip: "See the XState TS docs to learn how to strongly type this." };
    "error.platform.watch": { type: "error.platform.watch"; data: unknown };
    "done.invoke.subscribe": {
      type: "done.invoke.subscribe";
      data: unknown;
      __tip: "See the XState TS docs to learn how to strongly type this.";
    };
    "error.platform.subscribe": { type: "error.platform.subscribe"; data: unknown };
    "done.invoke.stop": { type: "done.invoke.stop"; data: unknown; __tip: "See the XState TS docs to learn how to strongly type this." };
    "error.platform.stop": { type: "error.platform.stop"; data: unknown };
  };
  invokeSrcNameMap: {
    start: "done.invoke.start";
    setup: "done.invoke.setup";
    watch: "done.invoke.watch";
    subscribe: "done.invoke.subscribe";
    stop: "done.invoke.stop";
  };
  missingImplementations: {
    actions: never;
    services: never;
    guards: never;
    delays: never;
  };
  eventsCausingActions: {};
  eventsCausingServices: {
    start: "STOP" | "xstate.init";
    setup: "done.invoke.start";
    watch: "done.invoke.start";
    subscribe: "done.invoke.start";
    stop: "STOP" | "error.platform.start";
  };
  eventsCausingGuards: {};
  eventsCausingDelays: {};
  matchesStates:
    | "starting"
    | "running"
    | "running.idle"
    | "running.writing"
    | "running.publishing"
    | "stopping"
    | "stopped"
    | { running?: "idle" | "writing" | "publishing" };
  tags: never;
}
