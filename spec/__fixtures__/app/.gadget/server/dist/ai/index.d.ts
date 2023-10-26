import { Readable } from "stream";
/**
 * Represents options for the OpenAI response stream.
 */
export interface OpenAIResponseStreamOptions {
    /**
     * A callback function that will be invoked when the OpenAI response stream is complete.
     * @param {string} content - The full output of the LLM response.
     */
    onComplete?: (content: string) => void;
}
/**
 * Converts the result of calling openai with `stream: true` into a readable stream that
 * Fasitfy can respond with.
 *
 *
 * @param {AsyncIterable<any>} stream - An AsyncIterable containing OpenAI response parts.
 * @param {OpenAIResponseStreamOptions} options - Options for the OpenAI response stream.
 * @returns {Readable} A Readable stream with the transformed content from the input stream.
 *
 *
 * @example
 * // Using the openAIResponseStream function to convert an AsyncIterable into a Readable stream
 * const stream = await connections.openai.chat.completions.create({
 *   model: "gpt-3.5-turbo",
 *   messages: [{ role: "user", content: "Hello!" }],
 *   stream: true,
 * });
 * await reply.send(openAIResponseStream(stream, {
 *  onComplete: (content) => { console.log(content) }
 * }));
 *
 * @see {@link https://github.com/openai/openai-node} - OpenAI Node.js client library.
 * @see {@link https://docs.gadget.dev/guides/http-routes/route-configuration#sending-responses} - Sending responses in Gadget.
 */
export declare function openAIResponseStream(openAIIterable: AsyncIterable<any>, options?: OpenAIResponseStreamOptions): Readable;
