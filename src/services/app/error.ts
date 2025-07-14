import type { GraphQLError } from "graphql";
import assert from "node:assert";
import pluralize from "pluralize";
import type { CloseEvent, ErrorEvent } from "ws";
import { GGTError, IsBug } from "../output/report.js";
import { sprint } from "../output/sprint.js";
import { uniq } from "../util/collection.js";
import { isCloseEvent, isError, isErrorEvent, isGraphQLErrors, isString, isStringArray } from "../util/is.js";
import { serializeError } from "../util/object.js";
import type { GraphQLMutation, GraphQLQuery, GraphQLSubscription } from "./edit/operation.js";

export class ClientError extends GGTError {
  public isBug: IsBug;

  override cause: string | string[] | Error | readonly GraphQLError[] | CloseEvent | ErrorEvent;

  constructor(
    readonly request: GraphQLQuery | GraphQLMutation | GraphQLSubscription,
    cause: unknown,
    isBug?: IsBug,
  ) {
    super("An error occurred while communicating with Gadget");

    if (isBug) {
      this.isBug = isBug;
    } else {
      this.isBug = IsBug.MAYBE;
    }

    // ErrorEvent and CloseEvent aren't serializable, so we reconstruct
    // them into an object. We discard the `target` property because
    // it's large and not that useful
    if (isErrorEvent(cause)) {
      this.cause = {
        type: cause.type,
        message: cause.message,
        error: serializeError(cause.error),
      } as ErrorEvent;
    } else if (isCloseEvent(cause)) {
      this.cause = {
        type: cause.type,
        code: cause.code,
        reason: cause.reason,
        wasClean: cause.wasClean,
      } as CloseEvent;
    } else {
      assert(
        isString(cause) || isStringArray(cause) || isError(cause) || isGraphQLErrors(cause),
        "cause must be a string, Error, GraphQLError[], CloseEvent, or ErrorEvent",
      );
      this.cause = cause;
    }
  }

  override render(): string {
    let body: string;

    switch (true) {
      case isGraphQLErrors(this.cause): {
        const errors = uniq(this.cause.map((x) => x.message));
        body = sprint`
          Gadget responded with the following ${pluralize("error", errors.length, false)}:

            • ${errors.join("\n            • ")}
        `;
        break;
      }
      case isCloseEvent(this.cause):
        body = "The connection to Gadget closed unexpectedly.";
        break;
      case isErrorEvent(this.cause) || isError(this.cause):
        body = this.cause.message;
        break;
      case isStringArray(this.cause):
        if (this.cause.length === 1) {
          body = String(this.cause[0]);
        } else {
          body = this.cause.join(", ");
        }
        break;
      default:
        body = this.cause;
        break;
    }

    return this.message + "\n\n" + body;
  }
}

export class AuthenticationError extends ClientError {
  constructor(request: GraphQLQuery | GraphQLMutation | GraphQLSubscription) {
    super(request, "Request authentication failed due to the session expiring while running the command. Please sign-in again.", IsBug.NO);
  }
}
