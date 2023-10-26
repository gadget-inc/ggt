"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var CurrentSession_exports = {};
__export(CurrentSession_exports, {
  CurrentSessionManager: () => CurrentSessionManager,
  DefaultSessionSelection: () => DefaultSessionSelection
});
module.exports = __toCommonJS(CurrentSession_exports);
var import_api_client_core = require("@gadgetinc/api-client-core");
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
        return await (0, import_api_client_core.findOneRunner)(
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CurrentSessionManager,
  DefaultSessionSelection
});
//# sourceMappingURL=CurrentSession.js.map
