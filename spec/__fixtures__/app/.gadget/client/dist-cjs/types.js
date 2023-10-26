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
var types_exports = {};
__export(types_exports, {
  GadgetFieldType: () => GadgetFieldType
});
module.exports = __toCommonJS(types_exports);
var GadgetFieldType = /* @__PURE__ */ ((GadgetFieldType2) => {
  GadgetFieldType2[GadgetFieldType2["ID"] = 0] = "ID";
  GadgetFieldType2[GadgetFieldType2["Number"] = 1] = "Number";
  GadgetFieldType2[GadgetFieldType2["String"] = 2] = "String";
  GadgetFieldType2[GadgetFieldType2["Enum"] = 3] = "Enum";
  GadgetFieldType2[GadgetFieldType2["RichText"] = 4] = "RichText";
  GadgetFieldType2[GadgetFieldType2["DateTime"] = 5] = "DateTime";
  GadgetFieldType2[GadgetFieldType2["Email"] = 6] = "Email";
  GadgetFieldType2[GadgetFieldType2["URL"] = 7] = "URL";
  GadgetFieldType2[GadgetFieldType2["Money"] = 8] = "Money";
  GadgetFieldType2[GadgetFieldType2["File"] = 9] = "File";
  GadgetFieldType2[GadgetFieldType2["Color"] = 10] = "Color";
  GadgetFieldType2[GadgetFieldType2["Password"] = 11] = "Password";
  GadgetFieldType2[GadgetFieldType2["Computed"] = 12] = "Computed";
  GadgetFieldType2[GadgetFieldType2["HasManyThrough"] = 13] = "HasManyThrough";
  GadgetFieldType2[GadgetFieldType2["BelongsTo"] = 14] = "BelongsTo";
  GadgetFieldType2[GadgetFieldType2["HasMany"] = 15] = "HasMany";
  GadgetFieldType2[GadgetFieldType2["HasOne"] = 16] = "HasOne";
  GadgetFieldType2[GadgetFieldType2["Boolean"] = 17] = "Boolean";
  GadgetFieldType2[GadgetFieldType2["Object"] = 18] = "Object";
  GadgetFieldType2[GadgetFieldType2["Array"] = 19] = "Array";
  GadgetFieldType2[GadgetFieldType2["JSON"] = 20] = "JSON";
  GadgetFieldType2[GadgetFieldType2["Code"] = 21] = "Code";
  GadgetFieldType2[GadgetFieldType2["EncryptedString"] = 22] = "EncryptedString";
  GadgetFieldType2[GadgetFieldType2["Vector"] = 23] = "Vector";
  GadgetFieldType2[GadgetFieldType2["Any"] = 24] = "Any";
  GadgetFieldType2[GadgetFieldType2["Null"] = 25] = "Null";
  GadgetFieldType2[GadgetFieldType2["RecordState"] = 26] = "RecordState";
  GadgetFieldType2[GadgetFieldType2["RoleAssignments"] = 27] = "RoleAssignments";
  return GadgetFieldType2;
})(GadgetFieldType || {});
;
;
;
;
;
;
;
;
;
;
;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GadgetFieldType
});
//# sourceMappingURL=types.js.map
