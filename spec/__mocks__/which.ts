const sync = jest.fn().mockName("whichSync").mockReturnValue("/path/to/yarn");

export default { sync };
