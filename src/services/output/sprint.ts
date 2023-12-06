import chalkTemplate from "chalk-template";
import { dedent } from "ts-dedent";
import { isString } from "../util/is.js";

export type Sprint = (template: TemplateStringsArray | string, ...values: unknown[]) => string;

export const sprint: Sprint = (template, ...values) => {
  let content = template;
  if (!isString(content)) {
    content = chalkTemplate(content, ...values);
  }
  return dedent(content);
};

export const sprintln: Sprint = (template, ...values) => {
  return sprint(template, ...values) + "\n";
};

export const sprintln2: Sprint = (template, ...values) => {
  return sprintln(template, ...values) + "\n";
};

export const sprintlns: Sprint = (template, ...values) => {
  return "\n" + sprintln(template, ...values);
};
