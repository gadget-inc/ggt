import { addBreadcrumb as addSentryBreadcrumb, type Breadcrumb as SentryBreadcrumb } from "@sentry/node";
import Debug from "debug";
import _ from "lodash";
import { serializeError } from "./errors.js";

const loggers: Record<Breadcrumb["category"], Debug.Debugger> = {
  client: Debug("ggt:client"),
  command: Debug("ggt:command"),
  fs: Debug("ggt:fs"),
  http: Debug("ggt:http"),
  notification: Debug("ggt:notification"),
  session: Debug("ggt:session"),
  sync: Debug("ggt:sync"),
  user: Debug("ggt:user"),
  version: Debug("ggt:version"),
};

export interface Breadcrumb extends SentryBreadcrumb {
  type: "debug" | "info" | "error";
  category: "fs" | "command" | "client" | "notification" | "sync" | "session" | "http" | "user" | "version";
  message: Capitalize<string>;
}

/**
 * Add a breadcrumb that will be logged and sent to Sentry.
 *
 * _Note_: Breadcrumbs are not sent to Sentry if the {@linkcode Breadcrumb.type} is "debug".
 * @param breadcrumb
 * @returns
 */
export const breadcrumb = (breadcrumb: Breadcrumb) => {
  if (breadcrumb.data) {
    loggers[breadcrumb.category]("%s: %s %O", breadcrumb.type, breadcrumb.message, breadcrumb.data);
  } else {
    loggers[breadcrumb.category]("%s: %s", breadcrumb.type, breadcrumb.message);
  }

  if (breadcrumb.type === "debug") {
    // don't send debug breadcrumbs to Sentry
    return;
  }

  // clone any objects in the data so that we get a snapshot of the object at the time the breadcrumb was added
  if (breadcrumb.data) {
    for (const [key, value] of Object.entries(breadcrumb.data)) {
      if (_.isObjectLike(value)) {
        if (key === "error") {
          breadcrumb.data[key] = serializeError(value);
        } else {
          breadcrumb.data[key] = _.cloneDeep(value);
        }
      }
    }
  }

  addSentryBreadcrumb(breadcrumb);
};
