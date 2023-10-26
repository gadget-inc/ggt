import crypto from "node:crypto";
import { FastifyReply, FastifyRequest } from "fastify";
import { Session } from "./Session";

declare module "fastify" {
  interface FastifyRequest {
    gadgetAuth?: {
      redirectToSignIn: boolean;
      signInPath: string;
    };
  }
}

export const generateCode = (numBytes = 64): string => {
  return crypto.randomBytes(numBytes).toString("hex");
};

export const hashCode = (code: string) => {
  return crypto.createHash("sha256").update(code).digest("hex");
};
const getSessionFromRequest = <Request extends FastifyRequest>(request: Request): Session => {
  if ("applicationSession" in request) {
    return request.applicationSession as any as Session;
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
export const preValidation = async <RouteContext extends FastifyRequest>(request: RouteContext, reply: FastifyReply) => {
  let authenticated = false;
  const applicationSession = getSessionFromRequest(request);
  authenticated = !!applicationSession.get("user");

  if (!authenticated) {
    if (request.gadgetAuth?.redirectToSignIn) {
      await reply.redirect(request.gadgetAuth.signInPath);
    } else {
      await reply.status(403).send();
    }
  }
};
