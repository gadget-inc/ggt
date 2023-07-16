import notifier, { type Notification } from "node-notifier";
import type WindowsBalloon from "node-notifier/notifiers/balloon.js";
import type Growl from "node-notifier/notifiers/growl.js";
import type NotificationCenter from "node-notifier/notifiers/notificationcenter.js";
import type NotifySend from "node-notifier/notifiers/notifysend.js";
import type WindowsToaster from "node-notifier/notifiers/toaster.js";
import path from "node:path";
import { context } from "./context.js";

/**
 * Sends a native OS notification to the user.
 *
 * @see {@link https://www.npmjs.com/package/node-notifier node-notifier}
 */
export const notify = (
  notification:
    | Notification
    | NotificationCenter.Notification
    | NotifySend.Notification
    | WindowsToaster.Notification
    | WindowsBalloon.Notification
    | Growl.Notification,
) => {
  notifier.notify(
    {
      title: "Gadget",
      contentImage: path.join(context.config.ggtDir, "assets", "favicon-128@4x.png"),
      icon: path.join(context.config.ggtDir, "assets", "favicon-128@4x.png"),
      sound: true,
      timeout: false,
      ...notification,
    },
    (error) => {
      if (error) console.error(error);
    },
  );
};
