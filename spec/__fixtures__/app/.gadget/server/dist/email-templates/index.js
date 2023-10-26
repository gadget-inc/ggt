"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderResetPasswordTemplate = exports.renderVerifyEmailTemplate = exports.renderEmailTemplate = void 0;
const globals_1 = require("../globals");
const reset_password_1 = require("./reset-password");
const verify_email_1 = require("./verify-email");
const AppConfigs_1 = require("../AppConfigs");
const emails_1 = require("../emails");
const errors_1 = require("../errors");
/**
 * Renders an email template using EJS.
 * @param {string} template - The EJS template content
 * @param {object} data - The data to be passed to the template
 * @returns {string} - The rendered email template
 */
const renderEmailTemplate = (template, data) => {
    if (!emails_1.emails) {
        throw new errors_1.GlobalNotSetError("emails is not yet defined");
    }
    try {
        return emails_1.emails.render(template, data);
    }
    catch (error) {
        globals_1.Globals.logger.error({ error, name: "emails" }, "An error occurred rendering your EJS email template");
        throw error;
    }
};
exports.renderEmailTemplate = renderEmailTemplate;
/**
 * Renders the "Verify Email" template.
 * * @param {templateData} data - The data used to render the template.
 * @param {string} [data.app_name] - The name of your app, defaults to Config.appName (optional)
 * @param {string} data.url - The url for the user to verify their account.
 * @returns {string} - The rendered html of the email template
 */
const renderVerifyEmailTemplate = (data) => {
    if (!AppConfigs_1.Config.appName && !data.app_name) {
        throw new errors_1.GlobalNotSetError("Config.appName is not yet defined");
    }
    const url = data.url;
    const app_name = data.app_name ?? AppConfigs_1.Config.appName;
    return (0, exports.renderEmailTemplate)(verify_email_1.VERIFY_EMAIL_TEMPLATE, { app_name, url });
};
exports.renderVerifyEmailTemplate = renderVerifyEmailTemplate;
/**
 * Renders the "Reset Password" template.
 * @param {templateData} data - The data used to render the template.
 * @param {string} [data.app_name] - The name of your app. If not provided, it defaults to Config.appName.
 * @param {string} data.url - The url for the user to reset their password.
 * @returns {string} - The rendered html of the email template.
 */
const renderResetPasswordTemplate = (data) => {
    if (!AppConfigs_1.Config.appName && !data.app_name) {
        throw new errors_1.GlobalNotSetError("Config.appName is not yet defined");
    }
    const url = data.url;
    const app_name = data.app_name ?? AppConfigs_1.Config.appName;
    return (0, exports.renderEmailTemplate)(reset_password_1.RESET_PASSWORD_TEMPLATE, { app_name, url });
};
exports.renderResetPasswordTemplate = renderResetPasswordTemplate;
//# sourceMappingURL=index.js.map