import { Readable, type ReadableOptions } from "stream";

class OpenAIResponseStream extends Readable {
  readonly openAIIterable: AsyncIterable<any>;
  reading: boolean;
  result: string;

  constructor(openAIIterable: AsyncIterable<any>, options: ReadableOptions = {}) {
    super(options);
    this.openAIIterable = openAIIterable;
    this.reading = false;
    this.result = "";
  }

  processChunk(): (chunk: any) => string | undefined {
    let isFunctionStreaming: boolean;

    return (json) => {
      if (json.choices[0]?.delta?.function_call?.name) {
        isFunctionStreaming = true;
        return `{"function_call": {"name": "${json.choices[0]?.delta?.function_call.name}", "arguments": "`;
      }

      if (json.choices[0]?.delta?.function_call?.arguments) {
        const argumentChunk: string = json.choices[0].delta.function_call.arguments;

        const escapedPartialJson = argumentChunk
          .replace(/\\/g, "\\\\") // Replace backslashes first to prevent double escaping
          .replace(/\//g, "\\/") // Escape slashes
          .replace(/"/g, '\\"') // Escape double quotes
          .replace(/\n/g, "\\n") // Escape new lines
          .replace(/\r/g, "\\r") // Escape carriage returns
          .replace(/\t/g, "\\t") // Escape tabs
          .replace(/\f/g, "\\f"); // Escape form feeds

        return `${escapedPartialJson}`;
      }

      if (isFunctionStreaming && (json.choices[0]?.finish_reason === "function_call" || json.choices[0]?.finish_reason === "stop")) {
        isFunctionStreaming = false;
        return '"}}';
      }

      return json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.text;
    };
  }

  async _read() {
    if (this.reading) return;
    this.reading = true;
    const process = this.processChunk();

    try {
      for await (const part of this.openAIIterable) {
        const content = process(part);
        if (content) {
          this.result += content;
          this.push(content);
        }
      }

      this.push(null);
      this.reading = false;
    } catch (err) {
      this.emit("error", err);
    }
  }
}

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
export function openAIResponseStream(openAIIterable: AsyncIterable<any>, options: OpenAIResponseStreamOptions = {}): Readable {
  const stream = new OpenAIResponseStream(openAIIterable);

  stream.on("end", () => {
    if (options.onComplete) options.onComplete(stream.result);
  });

  return stream;
}
