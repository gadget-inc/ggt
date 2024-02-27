import ora from "ora";

const spinner = ora();

export const startSpinner = (text?: string | undefined): void => {
  spinner.start(text);
};

export const succeedSpinner = (text?: string | undefined): void => {
  spinner.succeed(text);
};

export const failSpinner = (text?: string | undefined): void => {
  spinner.fail(text);
};

export const spinnerText = (): string => {
  return spinner.text;
};
