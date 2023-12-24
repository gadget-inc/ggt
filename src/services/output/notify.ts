import notifier, { type Notification } from "node-notifier";
import type WindowsBalloon from "node-notifier/notifiers/balloon.js";
import type Growl from "node-notifier/notifiers/growl.js";
import type NotificationCenter from "node-notifier/notifiers/notificationcenter.js";
import type NotifySend from "node-notifier/notifiers/notifysend.js";
import type WindowsToaster from "node-notifier/notifiers/toaster.js";
import type { Context } from "../command/context.js";
import { assetsPath } from "../util/paths.js";
import type { Field } from "./log/field.js";

/**
 * Sends a native OS notification to the user.
 *
 * @see {@link https://www.npmjs.com/package/node-notifier node-notifier}
 */
export const notify = (
  ctx: Context,
  notification:
    | Notification
    | NotificationCenter.Notification
    | NotifySend.Notification
    | WindowsToaster.Notification
    | WindowsBalloon.Notification
    | Growl.Notification,
): void => {
  ctx.log.info("notifying user", { notification: notification as Field });

  notifier.notify(
    {
      title: "Gadget",
      contentImage: assetsPath("favicon-128@4x.png"),
      icon: assetsPath("favicon-128@4x.png"),
      sound: true,
      timeout: false,
      ...notification,
    },
    (error) => {
      if (error) {
        ctx.log.warn("error notifying user", { notification: notification as Field });
      }
    },
  );
};
