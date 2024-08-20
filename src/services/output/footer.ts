import { output } from "./output.js";
import { sprintln, type SprintOptionsWithContent } from "./sprint.js";

export type footer = {
  (str: string | SprintOptionsWithContent): void;
  (template: TemplateStringsArray, ...values: unknown[]): void;
};

export const footer = ((optionsOrString: SprintOptionsWithContent | string | TemplateStringsArray, ...values: unknown[]): void => {
  const str = sprintln(optionsOrString as TemplateStringsArray, ...values);
  if (output.isInteractive) {
    output.updateFooter(str);
  } else {
    output.writeStdout(str);
  }
}) as footer;
