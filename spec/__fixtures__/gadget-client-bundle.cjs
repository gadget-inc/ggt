/**
 * A minimal mock Gadget client bundle for testing the `ggt eval` command.
 *
 * This simulates the structure of a real client bundle fetched from
 * /api/client/node.js, but with a simple mock implementation.
 */

class Client {
  constructor(options) {
    this._options = options;
    this.user = {
      findMany: async () => [
        { id: "1", name: "Alice", email: "alice@example.com" },
        { id: "2", name: "Bob", email: "bob@example.com" },
      ],
      findFirst: async () => ({ id: "1", name: "Alice", email: "alice@example.com" }),
      create: async (data) => ({ id: "3", ...data }),
    };
  }
}

module.exports = { Client };
