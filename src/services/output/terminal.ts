/**
 * Terminal-level notification utilities for drawing attention to
 * background terminal tabs (bell, title changes).
 */

export const setTerminalTitle = (title: string): void => {
  if (process.stdout.isTTY) {
    process.stdout.write(`\x1b]2;${title}\x07`);
  }
};

export const resetTerminalTitle = (): void => {
  setTerminalTitle("");
};

export const ringBell = (): void => {
  if (process.stdout.isTTY) {
    process.stdout.write("\x07");
  }
};
