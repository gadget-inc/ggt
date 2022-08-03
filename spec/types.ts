declare global {
  // assume every function has been jest.spyOn'd
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Function extends jest.MockInstance<any, any[]> {}
}

export {};
