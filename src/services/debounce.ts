export type DebouncedFunc<F extends (...args: unknown[]) => void> = F & {
  flush: () => void;
};

export const debounce = <F extends (...args: unknown[]) => void>(delayMS: number, f: F): DebouncedFunc<F> => {
  let timerId: NodeJS.Timeout | undefined;
  let upcomingCall: (() => void) | undefined;

  const debounced = ((...args) => {
    upcomingCall = () => {
      upcomingCall = undefined;
      timerId = undefined;
      f(...args);
    };

    clearTimeout(timerId);
    timerId = setTimeout(upcomingCall, delayMS);
  }) as DebouncedFunc<F>;

  debounced.flush = () => {
    if (upcomingCall) {
      upcomingCall();
    }
  };

  return debounced;
};
