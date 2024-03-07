/* eslint-disable func-style */

/**
 * Throws an error indicating that the code should be unreachable.
 *
 * @param expr - An optional expression to include in the error message.
 * @throws - Always throws an error with the message "Unreachable code: {expr}".
 */
export function unreachable(expr?: unknown): never {
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  throw new Error(`Unreachable code: ${expr}`);
}
