import type { App } from "../../src/services/app.js";
import { testUser } from "./user.js";

export const testApp: App = {
  id: 1,
  slug: "test",
  primaryDomain: "test.gadget.app",
  hasSplitEnvironments: true,
  user: testUser,
};
