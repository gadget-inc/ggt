import type { GraphQLError } from "graphql";
import assert from "node:assert";
import pluralize from "pluralize";
import type { CloseEvent, ErrorEvent } from "ws";
import { sprint } from "../../output/print.js";
import { CLIError, IsBug } from "../../output/report.js";
import { uniq } from "../../util/collection.js";
import { isCloseEvent, isError, isErrorEvent, isGraphQLErrors, isString } from "../../util/is.js";
import { serializeError } from "../../util/object.js";
import type { GraphQLMutation, GraphQLQuery, GraphQLSubscription } from "./operation.js";

export class EditError extends CLIError {
  isBug = IsBug.MAYBE;

  override cause: string | Error | readonly GraphQLError[] | CloseEvent | ErrorEvent;

  constructor(
    readonly request: GraphQLQuery | GraphQLMutation | GraphQLSubscription,
    cause: unknown,
  ) {
    super("An error occurred while communicating with Gadget");

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
        isString(cause) || isError(cause) || isGraphQLErrors(cause),
        "cause must be a string, Error, GraphQLError[], CloseEvent, or ErrorEvent",
      );
      this.cause = cause;
    }
  }

  override render(): string {
    let body = "";

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
      default:
        body = this.cause;
        break;
    }

    return this.message + "\n\n" + body;
  }
}
