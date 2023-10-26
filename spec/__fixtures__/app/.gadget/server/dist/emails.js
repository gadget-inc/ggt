"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setGadgetNodeMailer = exports.emails = void 0;
/**
 * This is used internally to set the gadget nodemailer Instance
 * @internal
 */
const setGadgetNodeMailer = (transporter) => {
    exports.emails = transporter;
};
exports.setGadgetNodeMailer = setGadgetNodeMailer;
//# sourceMappingURL=emails.js.map