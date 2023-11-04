import type { JsonObject } from "type-fest";
import { expect, vi } from "vitest";
import type { Payload, Query, Sink } from "../../src/services/app/edit-graphql.js";
import { EditGraphQL } from "../../src/services/app/edit-graphql.js";
import { noop } from "../../src/services/noop.js";

export type MockSubscription<Data extends JsonObject, Variables extends JsonObject, Extensions extends JsonObject> = {
  sink: Sink<Data, Extensions>;
  payload: Payload<Data, Variables>;
  unsubscribe: () => void;
};

export type MockEditGraphQL = {
  _subscriptions: Map<string, MockSubscription<JsonObject, JsonObject, JsonObject>>;
  _subscription<Data extends JsonObject, Variables extends JsonObject>(
    query: Query<Data, Variables>,
  ): MockSubscription<Data, Variables, JsonObject>;
} & EditGraphQL;

export const mockEditGraphQL = (): MockEditGraphQL => {
  const mock = {
    ...EditGraphQL.prototype,
    _subscriptions: new Map(),
    _subscription: <Data extends JsonObject, Variables extends JsonObject, Extensions extends JsonObject>(
      query: Query<Data, Variables, Extensions>,
    ) => {
      expect(Array.from(mock._subscriptions.keys())).toContain(query);
      const sub = mock._subscriptions.get(query);
      expect(sub).toBeTruthy();
      return sub as MockSubscription<Data, Variables, Extensions>;
    },
  };

  vi.spyOn(EditGraphQL.prototype, "dispose");
  vi.spyOn(EditGraphQL.prototype, "_subscribe").mockImplementation((payload, sink) => {
    if (!sink.complete) {
      sink.complete = noop;
    }

    const unsubscribe = vi.fn();
    vi.spyOn(sink, "next");
    vi.spyOn(sink, "error");
    vi.spyOn(sink, "complete");
    mock._subscriptions.set(payload.query, { payload, sink, unsubscribe });
    return unsubscribe;
  });

  return mock as MockEditGraphQL;
};
