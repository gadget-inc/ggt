"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.preValidation = exports.hashCode = exports.generateCode = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const generateCode = (numBytes = 64) => {
    return node_crypto_1.default.randomBytes(numBytes).toString("hex");
};
exports.generateCode = generateCode;
const hashCode = (code) => {
    return node_crypto_1.default.createHash("sha256").update(code).digest("hex");
};
exports.hashCode = hashCode;
const getSessionFromRequest = (request) => {
    if ("applicationSession" in request) {
        return request.applicationSession;
    }
    throw new Error("The request is not a Gadget server request");
};
/**
 * Safely compares a password reset code and hash
 * @param {string} [code] - The password reset code
 * @param {string} [hash] - The hashed password reset code
 * @returns {boolean} - Whether the code is valid or not
 */
/**
 * Utility function to wrap route handlers with protection from unauthenticated requests.
 *
 * @param handler The route handler to protect
 * @param {ProtectedRouteOptions} options Options for the protected route
 * @returns handler function that is wrapped with route protection
 *
 * @example
 * ```ts
 * // routes/GET-protected-route.js
 * const { preValidation } = require("@gadgetinc/auth");
 *
 * module.exports = async ({ request, reply }) => {
 *  await reply.send("this is a protected route");
 * }
 *
 * module.options = {
 *  preValidation,
 * }
 * ```
 */
const preValidation = async (request, reply) => {
    let authenticated = false;
    const applicationSession = getSessionFromRequest(request);
    authenticated = !!applicationSession.get("user");
    if (!authenticated) {
        if (request.gadgetAuth?.redirectToSignIn) {
            await reply.redirect(request.gadgetAuth.signInPath);
        }
        else {
            await reply.status(403).send();
        }
    }
};
exports.preValidation = preValidation;
//# sourceMappingURL=auth.js.map