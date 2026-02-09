import { GraphQLError } from "graphql";
import { beforeEach, describe, expect, it } from "vitest";
import { Api } from "../../../../src/services/app/api/api.js";
import { GADGET_META_MODELS_QUERY } from "../../../../src/services/app/api/operation.js";
import { ClientError } from "../../../../src/services/app/error.js";
import { testEnvironment } from "../../../__support__/app.js";
import { testCtx } from "../../../__support__/context.js";
import { expectError } from "../../../__support__/error.js";
import { nockApiResponse } from "../../../__support__/graphql.js";
import { loginTestUser } from "../../../__support__/user.js";

describe("Api", () => {
  let api: Api;

  beforeEach(() => {
    loginTestUser();
    api = new Api(testCtx, testEnvironment);
  });

  it("returns data from a successful query", async () => {
    nockApiResponse({
      operation: GADGET_META_MODELS_QUERY,
      response: {
        data: {
          gadgetMeta: {
            models: [{ apiIdentifier: "user", namespace: null }],
          },
        },
      },
    });

    const data = await api.query({ query: GADGET_META_MODELS_QUERY });

    expect(data).toEqual({
      gadgetMeta: {
        models: [{ apiIdentifier: "user", namespace: null }],
      },
    });
  });

  it("retries queries on HTTP 500", async () => {
    // First request returns 500, second returns success
    nockApiResponse({
      operation: GADGET_META_MODELS_QUERY,
      statusCode: 500,
      response: { errors: [new GraphQLError("Internal server error")] },
    });

    nockApiResponse({
      operation: GADGET_META_MODELS_QUERY,
      response: {
        data: {
          gadgetMeta: {
            models: [{ apiIdentifier: "user", namespace: null }],
          },
        },
      },
    });

    const data = await api.query({ query: GADGET_META_MODELS_QUERY });

    expect(data).toEqual({
      gadgetMeta: {
        models: [{ apiIdentifier: "user", namespace: null }],
      },
    });
  });

  it("throws ClientError on GraphQL errors", async () => {
    nockApiResponse({
      operation: GADGET_META_MODELS_QUERY,
      response: {
        errors: [new GraphQLError("Something went wrong")],
      },
    });

    const error = await expectError(() => api.query({ query: GADGET_META_MODELS_QUERY }));

    expect(error).toBeInstanceOf(ClientError);
  });

  it("throws ClientError on invalid non-JSON response", async () => {
    nockApiResponse({
      operation: GADGET_META_MODELS_QUERY,
      statusCode: 503,
      response: "Service Unavailable" as any,
    });

    const error = await expectError(() => api.query({ query: GADGET_META_MODELS_QUERY }));

    expect(error).toBeInstanceOf(ClientError);
  });

  it("throws ClientError when response has no data", async () => {
    nockApiResponse({
      operation: GADGET_META_MODELS_QUERY,
      response: { data: null } as any,
    });

    const error = await expectError(() => api.query({ query: GADGET_META_MODELS_QUERY }));

    expect(error).toBeInstanceOf(ClientError);
  });
});
