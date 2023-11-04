export type DebouncedFunc<F extends (...args: unknown[]) => void> = F & {
  /**
   * Invokes the function if it is waiting to stop being called
   */
  flush: () => void;
};

/**
 * Creates a debounced function that delays invoking the provided
 * function until after `delayMS` milliseconds have elapsed since the
 * last time it was invoked.
 *
 * @param delayMS The number of milliseconds to delay.
 * @param f The function to be debounced.
 * @returns A debounced version of the provided function.
 */
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
