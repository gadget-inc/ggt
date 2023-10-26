import { Globals } from "../globals";
import { RESET_PASSWORD_TEMPLATE } from "./reset-password";
import { VERIFY_EMAIL_TEMPLATE } from "./verify-email";
import { Config } from "../AppConfigs";
import { emails } from "../emails";
import { GlobalNotSetError } from "../errors";

interface templateData {
  app_name?: string;
  url: string;
}

/**
 * Renders an email template using EJS.
 * @param {string} template - The EJS template content
 * @param {object} data - The data to be passed to the template
 * @returns {string} - The rendered email template
 */
export const renderEmailTemplate = (template: string, data: Record<string, any>) => {
  if (!emails) {
    throw new GlobalNotSetError("emails is not yet defined");
  }

  try {
    return emails.render(template, data);
  } catch (error) {
    Globals.logger.error({ error, name: "emails" }, "An error occurred rendering your EJS email template");
    throw error;
  }
};

/**
 * Renders the "Verify Email" template.
 * * @param {templateData} data - The data used to render the template.
 * @param {string} [data.app_name] - The name of your app, defaults to Config.appName (optional)
 * @param {string} data.url - The url for the user to verify their account.
 * @returns {string} - The rendered html of the email template
 */
export const renderVerifyEmailTemplate = (data: templateData) => {
  if (!Config.appName && !data.app_name) {
    throw new GlobalNotSetError("Config.appName is not yet defined");
  }

  const url = data.url;
  const app_name = data.app_name ?? Config.appName;
  return renderEmailTemplate(VERIFY_EMAIL_TEMPLATE, { app_name, url });
};

/**
 * Renders the "Reset Password" template.
 * @param {templateData} data - The data used to render the template.
 * @param {string} [data.app_name] - The name of your app. If not provided, it defaults to Config.appName.
 * @param {string} data.url - The url for the user to reset their password.
 * @returns {string} - The rendered html of the email template.
 */
export const renderResetPasswordTemplate = (data: templateData) => {
  if (!Config.appName && !data.app_name) {
    throw new GlobalNotSetError("Config.appName is not yet defined");
  }

  const url = data.url;
  const app_name = data.app_name ?? Config.appName;
  return renderEmailTemplate(RESET_PASSWORD_TEMPLATE, { app_name, url });
};
