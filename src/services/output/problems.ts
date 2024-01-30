import chalk from "chalk";
import pluralize from "pluralize";
import type { Problem as FileSyncProblem, PublishIssue } from "../../__generated__/graphql.js";
import type { Context } from "../command/context.js";
import { compact } from "../util/collection.js";
import { isGellyFile, isJavaScriptFile, isTypeScriptFile } from "../util/is.js";
import { sprint, sprintln, sprintlns } from "./sprint.js";

export type Problems = Record<string, Problem[]>;

export type Problem = {
  type: string;
  severity: ProblemSeverity;
  message: string;
  labels: string[];
};

export const ProblemSeverity = Object.freeze({
  Fatal: "Fatal",
  Error: "Error",
  Warning: "Warning",
  Info: "Info",
});

export type ProblemSeverity = keyof typeof ProblemSeverity;

export const sprintProblems = (problems: Problems): string => {
  let output = "";

  for (const [name, issues] of Object.entries(problems)) {
    output += sprintlns`• {cyan ${name}} {redBright ${pluralize("issue", issues.length, true)}}`;
    for (const issue of issues) {
      const [message, ...lines] = issue.message.split("\n") as [string, ...string[]];

      output += sprint`  {red ✖} `;
      if (issue.type === "SourceFile") {
        output += sprint`${filetype(name)} ${message}`;
      } else {
        output += sprint(message);
      }

      for (const line of lines) {
        output += sprintln("");
        output += sprint`    ${line}`;
      }

      for (const label of issue.labels) {
        output += sprint` {dim ${label}}`;
      }

      output += sprintln("");
    }
  }

  return output;
};

export const printProblems = (ctx: Context, problems: Problems): void => {
  ctx.log.printlns(sprintProblems(problems));
};

export const filetype = (filename: string): string => {
  switch (true) {
    case isJavaScriptFile(filename):
      return chalk.yellowBright("JavaScript");
    case isTypeScriptFile(filename):
      return chalk.blue("TypeScript");
    case isGellyFile(filename):
      return chalk.magenta("Gelly");
    default:
      return chalk.gray("File");
  }
};

export const issuesToProblems = (issues: PublishIssue[]): Problems => {
  const problems: Problems = {};
  for (const issue of issues) {
    const name = issue.node?.apiIdentifier ?? issue.node?.name ?? "Other";
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    problems[name] ??= [];
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    problems[name]!.push({
      type: issue.node?.type ?? "Unknown",
      severity: issue.severity as ProblemSeverity,
      message: issue.message,
      labels: compact(issue.nodeLabels?.map((label) => label?.identifier) ?? []),
    });
  }
  return problems;
};

export const filesyncProblemsToProblems = (filesyncProblems: FileSyncProblem[]): Problems => {
  const problems: Problems = {};
  for (const filesyncProblem of filesyncProblems) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    problems[filesyncProblem.path] ??= [];
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    problems[filesyncProblem.path]!.push({
      type: filesyncProblem.type,
      severity: filesyncProblem.level as ProblemSeverity,
      message: filesyncProblem.message,
      labels: [],
    });
  }
  return problems;
};
