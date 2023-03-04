import chalk from "chalk";
import { ux } from "@oclif/core";
import dedent from "ts-dedent";
import { BaseCommand } from "../utils/base-command";
import type { App } from "../utils/context";
import { context } from "../utils/context";

export default class List extends BaseCommand<typeof List> {
  static override summary = "List the apps available to the currently logged in user.";

  static override usage = "list";

  static override examples = [
    dedent(chalk`
      {gray $ ggt list}
      {gray $ ggt list --extended}
      {gray $ ggt list --sort=slug}
    `),
  ];

  static override flags = {
    ...ux.table.flags(),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(List);
    const user = await context.getUser();
    if (!user) {
      this.error("You are not logged in -- no apps available", { exit: 1 });
    }
    const apps = await context.getAvailableApps();

    if (apps.length === 0 && !flags.csv) {
      this.log("No apps found");
      return;
    }

    ux.table<App & Record<string, never>>(
      apps as unknown as (App & Record<string, never>)[],
      {
        id: {
          header: "ID",
          extended: true,
        },
        slug: {
          header: "Slug",
        },
        primaryDomain: {
          header: "Domain",
        },
      },
      {
        printLine: this.log.bind(this),
        ...flags, // parsed flags
      }
    );
  }
}
