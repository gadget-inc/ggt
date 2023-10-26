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
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var src_exports = {};
__export(src_exports, {
  BrowserSessionStorageType: () => import_api_client_core.BrowserSessionStorageType,
  GadgetClientError: () => import_api_client_core.GadgetClientError,
  GadgetConnection: () => import_api_client_core.GadgetConnection,
  GadgetInternalError: () => import_api_client_core.GadgetInternalError,
  GadgetOperationError: () => import_api_client_core.GadgetOperationError,
  GadgetRecord: () => import_api_client_core.GadgetRecord,
  GadgetRecordList: () => import_api_client_core.GadgetRecordList,
  GadgetValidationError: () => import_api_client_core.GadgetValidationError,
  InvalidRecordError: () => import_api_client_core.InvalidRecordError
});
module.exports = __toCommonJS(src_exports);
var import_api_client_core = require("@gadgetinc/api-client-core");
__reExport(src_exports, require("./Client.js"), module.exports);
__reExport(src_exports, require("./types.js"), module.exports);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BrowserSessionStorageType,
  GadgetClientError,
  GadgetConnection,
  GadgetInternalError,
  GadgetOperationError,
  GadgetRecord,
  GadgetRecordList,
  GadgetValidationError,
  InvalidRecordError,
  ...require("./Client.js"),
  ...require("./types.js")
});
//# sourceMappingURL=index.js.map
