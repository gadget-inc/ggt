import nock from "nock";
import { api, GADGET_ENDPOINT } from "../../src/lib/api";
import { session } from "../../src/lib/session";

describe("Api", () => {
  describe("getCurrentUser", () => {
    it("returns the user if the session is set", async () => {
      const user = { email: "test@example.com", name: "Jane Doe" };
      nock(GADGET_ENDPOINT).get("/auth/api/current-user").reply(200, user);
      session.set("test");

      await expect(api.getCurrentUser()).resolves.toEqual(user);
      expect(nock.isDone()).toBeTrue();
    });

    it("returns undefined if the session is not set", async () => {
      session.set(undefined);
      await expect(api.getCurrentUser()).resolves.toBeUndefined();
    });

    it("returns undefined if the session is invalid or expired", async () => {
      session.set("test");
      nock(GADGET_ENDPOINT).get("/auth/api/current-user").reply(401);

      await expect(api.getCurrentUser()).resolves.toBeUndefined();
      expect(nock.isDone()).toBe(true);
      expect(session.get()).toBeUndefined();
    });
  });
});
