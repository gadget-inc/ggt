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
export declare const renderEmailTemplate: (template: string, data: Record<string, any>) => string;
/**
 * Renders the "Verify Email" template.
 * * @param {templateData} data - The data used to render the template.
 * @param {string} [data.app_name] - The name of your app, defaults to Config.appName (optional)
 * @param {string} data.url - The url for the user to verify their account.
 * @returns {string} - The rendered html of the email template
 */
export declare const renderVerifyEmailTemplate: (data: templateData) => string;
/**
 * Renders the "Reset Password" template.
 * @param {templateData} data - The data used to render the template.
 * @param {string} [data.app_name] - The name of your app. If not provided, it defaults to Config.appName.
 * @param {string} data.url - The url for the user to reset their password.
 * @returns {string} - The rendered html of the email template.
 */
export declare const renderResetPasswordTemplate: (data: templateData) => string;
export {};
