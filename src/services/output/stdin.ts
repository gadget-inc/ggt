/* eslint-disable */
/**
 * MIT License
 *
 * Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import process from "node:process";

const ASCII_ETX_CODE = 0x03; // Ctrl+C emits this code

/**
 * https://github.com/sindresorhus/stdin-discarder/blob/329c85219534b7e1f6272a3f15c4daa8f05d04a4/index.js
 * TODO: we can use the original package when we upgrade to Node.js 18
 */
class StdinDiscarder {
  #activeCount = 0;

  start() {
    this.#activeCount++;

    if (this.#activeCount === 1) {
      this.#realStart();
    }
  }

  stop() {
    if (this.#activeCount <= 0) {
      throw new Error("`stop` called more times than `start`");
    }

    this.#activeCount--;

    if (this.#activeCount === 0) {
      this.#realStop();
    }
  }

  #realStart() {
    // No known way to make it work reliably on Windows.
    if (process.platform === "win32" || !process.stdin.isTTY) {
      return;
    }

    process.stdin.setRawMode(true);
    process.stdin.on("data", this.#handleInput);
    process.stdin.resume();
  }

  #realStop() {
    if (!process.stdin.isTTY) {
      return;
    }

    process.stdin.off("data", this.#handleInput);
    process.stdin.pause();
    process.stdin.setRawMode(false);
  }

  #handleInput(chunk: Buffer) {
    // Allow Ctrl+C to gracefully exit.
    if (chunk[0] === ASCII_ETX_CODE) {
      process.emit("SIGINT");
    }
  }
}

const stdinDiscarder = new StdinDiscarder();

export default stdinDiscarder;
