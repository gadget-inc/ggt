import { output } from "./output.js";
import { isSprintOptions, sprintln, type SprintOptions } from "./sprint.js";

export type footer = {
  (str: string): void;
  (template: TemplateStringsArray, ...values: unknown[]): void;
  (options: SprintOptions): footer;
};

const createFooter = (options: SprintOptions): footer => {
  return ((optionsOrString: SprintOptions | string | TemplateStringsArray, ...values: unknown[]): footer | undefined => {
    if (isSprintOptions(optionsOrString)) {
      return createFooter({ ...options, ...optionsOrString });
    }

    const str = sprintln(options)(optionsOrString as TemplateStringsArray, ...values);

    if (output.isInteractive) {
      output.updateFooter(str);
    } else {
      output.writeStdout(str);
    }

    return;
  }) as footer;
};

export const footer = createFooter({});
