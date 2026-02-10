import { describe, expect, it } from "vitest";

import type { Problem as FileSyncProblem, PublishIssue } from "../../../src/__generated__/graphql.js";

import {
  filesyncProblemsToProblems,
  filetype,
  publishIssuesToProblems,
  sprintProblems,
  type Problems,
} from "../../../src/services/output/problems.js";

describe("sprintProblems", () => {
  it("formats a single file with a single problem", () => {
    const problems: Problems = {
      "user.js": [
        {
          type: "SourceFile",
          severity: "Error",
          message: "Unexpected token",
          labels: [],
        },
      ],
    };

    const result = sprintProblems({ problems });
    expect(result).toMatchInlineSnapshot(`
      "
      • user.js 1 problem
        ✖ JavaScript Unexpected token
      "
    `);
  });

  it("formats a single file with multiple problems", () => {
    const problems: Problems = {
      "user.js": [
        { type: "SourceFile", severity: "Error", message: "Error 1", labels: [] },
        { type: "SourceFile", severity: "Warning", message: "Error 2", labels: [] },
      ],
    };

    const result = sprintProblems({ problems });
    expect(result).toMatchInlineSnapshot(`
      "
      • user.js 2 problems
        ✖ JavaScript Error 1
        ✖ JavaScript Error 2
      "
    `);
  });

  it("formats multiple files with problems", () => {
    const problems: Problems = {
      "user.js": [{ type: "SourceFile", severity: "Error", message: "Error in user", labels: [] }],
      "post.ts": [{ type: "SourceFile", severity: "Error", message: "Error in post", labels: [] }],
    };

    const result = sprintProblems({ problems });
    expect(result).toMatchInlineSnapshot(`
      "
      • user.js 1 problem
        ✖ JavaScript Error in user

      • post.ts 1 problem
        ✖ TypeScript Error in post
      "
    `);
  });

  it("handles multi-line problem messages", () => {
    const problems: Problems = {
      "user.js": [
        {
          type: "SourceFile",
          severity: "Error",
          message: "Line 1\nLine 2\nLine 3",
          labels: [],
        },
      ],
    };

    const result = sprintProblems({ problems });
    expect(result).toMatchInlineSnapshot(`
      "
      • user.js 1 problem
        ✖ JavaScript Line 1
          Line 2
          Line 3
      "
    `);
  });

  it("displays labels", () => {
    const problems: Problems = {
      "user.js": [
        {
          type: "SourceFile",
          severity: "Error",
          message: "Type error",
          labels: ["field:name", "action:create"],
        },
      ],
    };

    const result = sprintProblems({ problems });
    expect(result).toMatchInlineSnapshot(`
      "
      • user.js 1 problem
        ✖ JavaScript Type error field:name action:create
      "
    `);
  });

  it("shows file types by default for SourceFile problems", () => {
    const problems: Problems = {
      "user.js": [{ type: "SourceFile", severity: "Error", message: "Error", labels: [] }],
    };

    const result = sprintProblems({ problems });
    expect(result).toMatchInlineSnapshot(`
      "
      • user.js 1 problem
        ✖ JavaScript Error
      "
    `);
  });

  it("hides file types when showFileTypes is false", () => {
    const problems: Problems = {
      "user.js": [{ type: "SourceFile", severity: "Error", message: "Error", labels: [] }],
    };

    const result = sprintProblems({ problems, showFileTypes: false });
    expect(result).toMatchInlineSnapshot(`
      "
      • user.js 1 problem
        ✖ Error
      "
    `);
  });

  it("shows file types when showFileTypes is true even for non-SourceFile types", () => {
    const problems: Problems = {
      "user.js": [{ type: "Model", severity: "Error", message: "Error", labels: [] }],
    };

    const result = sprintProblems({ problems, showFileTypes: true });
    expect(result).toMatchInlineSnapshot(`
      "
      • user.js 1 problem
        ✖ JavaScript Error
      "
    `);
  });
});

describe("filetype", () => {
  it("returns JavaScript for .js files", () => {
    expect(filetype("user.js")).toMatchInlineSnapshot(`"JavaScript"`);
  });

  it("returns JavaScript for .jsx files", () => {
    expect(filetype("component.jsx")).toMatchInlineSnapshot(`"JavaScript"`);
  });

  it("returns TypeScript for .ts files", () => {
    expect(filetype("user.ts")).toMatchInlineSnapshot(`"TypeScript"`);
  });

  it("returns TypeScript for .tsx files", () => {
    expect(filetype("component.tsx")).toMatchInlineSnapshot(`"TypeScript"`);
  });

  it("returns Gelly for .gelly files", () => {
    expect(filetype("query.gelly")).toMatchInlineSnapshot(`"Gelly"`);
  });

  it("returns File for unknown extensions", () => {
    expect(filetype("data.json")).toMatchInlineSnapshot(`"File"`);
  });
});

describe("publishIssuesToProblems", () => {
  it("converts publish issues to problems grouped by node identifier", () => {
    const issues: PublishIssue[] = [
      {
        severity: "Error",
        message: "Something went wrong",
        node: { key: "model-user", apiIdentifier: "user", name: "User", type: "Model" },
        nodeLabels: [{ identifier: "field:name" }],
      },
    ];

    const result = publishIssuesToProblems(issues);
    expect(result).toEqual({
      user: [
        {
          type: "Model",
          severity: "Error",
          message: "Something went wrong",
          labels: ["field:name"],
        },
      ],
    });
  });

  it("falls back to node.name when apiIdentifier is missing", () => {
    const issues: PublishIssue[] = [
      {
        severity: "Error",
        message: "Error",
        node: { key: "model-user", name: "User", type: "Model" },
        nodeLabels: [],
      },
    ];

    const result = publishIssuesToProblems(issues);
    expect(result["User"]).toBeDefined();
  });

  it("falls back to 'Other' when node is missing", () => {
    const issues: PublishIssue[] = [
      {
        severity: "Error",
        message: "Error",
        nodeLabels: [],
      },
    ];

    const result = publishIssuesToProblems(issues);
    expect(result["Other"]).toBeDefined();
  });

  it("groups multiple issues under the same node", () => {
    const issues: PublishIssue[] = [
      {
        severity: "Error",
        message: "Error 1",
        node: { key: "model-user", apiIdentifier: "user", name: "User", type: "Model" },
        nodeLabels: [],
      },
      {
        severity: "Warning",
        message: "Warning 1",
        node: { key: "model-user", apiIdentifier: "user", name: "User", type: "Model" },
        nodeLabels: [],
      },
    ];

    const result = publishIssuesToProblems(issues);
    expect(result["user"]).toHaveLength(2);
  });
});

describe("filesyncProblemsToProblems", () => {
  it("converts filesync problems to problems grouped by path", () => {
    const filesyncProblems: FileSyncProblem[] = [
      {
        path: "src/user.js",
        type: "SourceFile",
        level: "Error",
        message: "Syntax error",
      },
    ];

    const result = filesyncProblemsToProblems(filesyncProblems);
    expect(result).toEqual({
      "src/user.js": [
        {
          type: "SourceFile",
          severity: "Error",
          message: "Syntax error",
          labels: [],
        },
      ],
    });
  });

  it("groups multiple problems under the same path", () => {
    const filesyncProblems: FileSyncProblem[] = [
      { path: "src/user.js", type: "SourceFile", level: "Error", message: "Error 1" },
      { path: "src/user.js", type: "SourceFile", level: "Warning", message: "Warning 1" },
    ];

    const result = filesyncProblemsToProblems(filesyncProblems);
    expect(result["src/user.js"]).toHaveLength(2);
  });
});
