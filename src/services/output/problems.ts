import chalk from "chalk";
import pluralize from "pluralize";
import type { Problem as FileSyncProblem, PublishIssue } from "../../__generated__/graphql.js";
import { compact } from "../util/collection.js";
import { isGellyFile, isJavaScriptFile, isTypeScriptFile } from "../util/is.js";
import { println } from "./print.js";
import { sprint, sprintln, type SprintOptions } from "./sprint.js";

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

export type PrintProblemsOptions = SprintOptions & {
  /**
   * The problems to print.
   */
  problems: Problems;

  /**
   * Whether to show the file type in the output.
   *
   * @default problem.type === "SourceFile"
   */
  showFileTypes?: boolean;
};

export const sprintProblems = ({ problems: groupedProblems, showFileTypes, ...sprintOptions }: PrintProblemsOptions): string => {
  let content = "";

  for (const [name, problems] of Object.entries(groupedProblems)) {
    content += sprintln("");
    content += sprintln`• {cyan ${name}} {redBright ${pluralize("problem", problems.length, true)}}`;
    for (const problem of problems) {
      const [message, ...lines] = problem.message.split("\n") as [string, ...string[]];

      content += sprint`  {red ✖} `;
      if (showFileTypes ?? problem.type === "SourceFile") {
        content += sprint`${filetype(name)} `;
      }
      content += sprint(message);

      for (const line of lines) {
        content += sprintln("");
        content += sprint`    ${line}`;
      }

      for (const label of problem.labels) {
        content += sprint` {dim ${label}}`;
      }

      content += sprintln("");
    }
  }

  return sprintln({ ...sprintOptions, content });
};

export const printProblems = (options: PrintProblemsOptions): void => {
  println(sprintProblems(options));
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

export const publishIssuesToProblems = (issues: PublishIssue[]): Problems => {
  const problems: Problems = {};
  for (const issue of issues) {
    const name = issue.node?.apiIdentifier ?? issue.node?.name ?? "Other";
    problems[name] ??= [];
    problems[name].push({
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
    problems[filesyncProblem.path] ??= [];
    // oxlint-disable-next-line no-non-null-assertion
    problems[filesyncProblem.path]!.push({
      type: filesyncProblem.type,
      severity: filesyncProblem.level as ProblemSeverity,
      message: filesyncProblem.message,
      labels: [],
    });
  }
  return problems;
};
