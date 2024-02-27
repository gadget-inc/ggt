import ansiEscapes from "ansi-escapes";
import assert from "node:assert";
import EventEmitter from "node:events";
import process from "node:process";
import readline from "node:readline";
import { stderr } from "./output.js";

export class Prompt extends EventEmitter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [action: string]: any; // (key: StdinKey) => void;

  static active = false;

  // state
  value: unknown = undefined;
  firstRender = true;
  done = false;
  closed = false;
  aborted = false;
  exited = false;

  // methods that rely on constructor closure
  close: () => void;

  constructor() {
    super();
    assert(!Prompt.active, "only one prompt can be active at a time");
    Prompt.active = true;

    const rl = readline.createInterface({ input: process.stdin, escapeCodeTimeout: 50 });
    readline.emitKeypressEvents(process.stdin, rl);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    const isSelect = ["SelectPrompt"].includes(this.constructor.name);
    const keypress = (str: string, key: StdinKey): void => {
      const action = getPromptAction(key, isSelect);
      if (action === false) {
        this._(str, key);
      } else if (action && typeof this[action] === "function") {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        this[action](key);
      } else {
        this.bell();
      }
    };

    this.close = () => {
      process.stdin.removeListener("keypress", keypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }

      rl.close();
      this.emit(this.aborted ? "abort" : this.exited ? "exit" : "submit", this.value);
      this.closed = true;
      Prompt.active = false;
    };

    process.stdin.on("keypress", keypress);
  }

  _(_str: string, _key: StdinKey): void {
    // noop
  }

  onRender(): void {
    // noop
  }

  fire(): void {
    this.emit("state", {
      value: this.value,
      aborted: this.aborted,
      exited: this.exited,
    });
  }

  bell(): void {
    stderr.write(ansiEscapes.beep);
  }

  render(): void {
    this.onRender();
    if (this.firstRender) {
      this.firstRender = false;
    }
  }
}

export type PromptAction =
  | "abort"
  | "exit"
  | "submit"
  | "next"
  | "nextPage"
  | "prevPage"
  | "home"
  | "end"
  | "up"
  | "down"
  | "right"
  | "left"
  | "reset"
  | "delete"
  | "deleteForward"
  | "first"
  | "last";

export type StdinKey = {
  name: string;
  ctrl: boolean;
  meta: boolean;
};

const getPromptAction = (key: StdinKey, isSelect: boolean): PromptAction | false | undefined => {
  if (key.meta && key.name !== "escape") {
    return;
  }

  if (key.ctrl) {
    switch (key.name) {
      case "a":
        return "first";
      case "c":
      case "d":
        return "abort";
      case "e":
        return "last";
      case "g":
        return "reset";
    }
  }

  if (isSelect) {
    if (key.name === "j") {
      return "down";
    }
    if (key.name === "k") {
      return "up";
    }
  }

  switch (key.name) {
    case "return":
    case "enter":
      return "submit";
    case "backspace":
      return "delete";
    case "delete":
      return "deleteForward";
    case "abort":
      return "abort";
    case "escape":
      return "exit";
    case "tab":
      return "next";
    case "pagedown":
      return "nextPage";
    case "pageup":
      return "prevPage";
    case "home":
      return "home";
    case "end":
      return "end";
    case "up":
      return "up";
    case "down":
      return "down";
    case "right":
      return "right";
    case "left":
      return "left";
    default:
      return false;
  }
};

/**
 * Determine what entries should be displayed on the screen, based on the
 * currently selected index and the maximum visible. Used in list-based
 * prompts like `select` and `multiselect`.
 *
 * @param cursor - the currently selected entry
 * @param total - the total entries available to display
 * @param [maxVisible] - the number of entries that can be displayed
 */
export const entriesToDisplay = (cursor: number, total: number, maxVisible: number): { startIndex: number; endIndex: number } => {
  maxVisible = maxVisible || total;

  let startIndex = Math.min(total - maxVisible, cursor - Math.floor(maxVisible / 2));
  if (startIndex < 0) {
    startIndex = 0;
  }

  const endIndex = Math.min(startIndex + maxVisible, total);

  return { startIndex, endIndex };
};
