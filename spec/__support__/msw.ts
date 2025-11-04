import { setupServer } from "msw/node";

export const mockServer = setupServer();

export const start = (): void => {
  mockServer.listen({
    onUnhandledRequest(request, print) {
      // Bypass localhost requests entirely
      const url = new URL(request.url);
      if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
        return;
      }

      // Log unhandled remote requests
      print.warning();
    },
  });
};

export const cleanup = (): void => {
  mockServer.resetHandlers();
};

export const stop = (): void => {
  mockServer.close();
};
