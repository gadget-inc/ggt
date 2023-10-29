// @ts-expect-error purposefully adding non-existent toJSON method to BigInt
BigInt.prototype.toJSON = function () {
  return this.toString();
};
