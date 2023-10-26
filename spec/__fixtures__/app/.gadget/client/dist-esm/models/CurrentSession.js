import {
  findOneRunner
} from "@gadgetinc/api-client-core";
const DefaultSessionSelection = {
  "__typename": true,
  "createdAt": true,
  "id": true,
  "state": true,
  "updatedAt": true
};
;
const apiIdentifier = "session";
const pluralApiIdentifier = "sessions";
class CurrentSessionManager {
  constructor(connection) {
    this.connection = connection;
    /**
    * Retrieves the current session. Returns a `Promise` that resolves to the record if found and rejects the promise if the record isn't found.
    **/
    this.get = Object.assign(
      async (options) => {
        return await findOneRunner(
          this,
          "currentSession",
          void 0,
          DefaultSessionSelection,
          "session",
          options
        );
      },
      {
        type: "get",
        operationName: "currentSession",
        modelApiIdentifier: "session",
        defaultSelection: DefaultSessionSelection
      }
    );
  }
}
export {
  CurrentSessionManager,
  DefaultSessionSelection
};
//# sourceMappingURL=CurrentSession.js.map
