import { addBreadcrumb as addSentryBreadcrumb, type Breadcrumb as SentryBreadcrumb } from "@sentry/node";
import Debug from "debug";
import _ from "lodash";
import process from "process";
import { parseBoolean } from "./args.js";

const loggers: Record<Breadcrumb["category"], Debug.Debugger> = {
  client: Debug("ggt:client"),
  command: Debug("ggt:command"),
  fs: Debug("ggt:fs"),
  notification: Debug("ggt:notification"),
  sync: Debug("ggt:sync"),
  test: Debug("ggt:test"),
};

if (process.env["DEBUG"]) {
  if (parseBoolean(process.env["DEBUG"])) {
    Debug.enable("ggt:*");
  } else {
    Debug.enable(process.env["DEBUG"]);
  }
}

export interface Breadcrumb extends SentryBreadcrumb {
  /**
   * @see https://develop.sentry.dev/sdk/event-payloads/breadcrumbs/#breadcrumb-types
   */
  type: "debug" | "info" | "error" | "http" | "query" | "user";
  category: "fs" | "command" | "client" | "notification" | "sync" | "test";
  message: Capitalize<string>;
}

export const addBreadcrumb = (breadcrumb: Breadcrumb) => {
  loggers[breadcrumb.category]("%s: %s %O", breadcrumb.type, breadcrumb.message, breadcrumb.data);
  if (breadcrumb.type === "debug") return;

  // clone any objects in the data so that we get a snapshot of the object at the time the breadcrumb was added
  if (breadcrumb.data) {
    for (const [key, value] of Object.entries(breadcrumb.data)) {
      if (_.isObjectLike(value)) {
        breadcrumb.data[key] = _.cloneDeep(value);
      }
    }
  }

  addSentryBreadcrumb(breadcrumb);
};
