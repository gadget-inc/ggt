import type { GadgetMailer } from "./types";

/**
 * An instance of the Gadget NodeMailer
 */
export let emails: GadgetMailer;

/**
 * This is used internally to set the gadget nodemailer Instance
 * @internal
 */
export const setGadgetNodeMailer = (transporter: any) => {
  emails = transporter;
};
