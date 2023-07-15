import { ux } from "@oclif/core";
import chalkTemplate from "chalk-template";
import { dedent } from "ts-dedent";
import { BaseCommand } from "../services/base-command.js";
import type { App } from "../services/context.js";
import { context } from "../services/context.js";

export default class List extends BaseCommand<typeof List> {
  static override summary = "List the apps available to the currently logged in user.";

  static override usage = "list";

  static override examples = [
    dedent(chalkTemplate`
      {gray $ ggt list}
      {gray $ ggt list --extended}
      {gray $ ggt list --sort=slug}
    `),
  ];

  static override flags = {
    ...ux.table.flags(),
  };

  override requireUser = true;

  async run(): Promise<void> {
    const { flags } = await this.parse(List);

    const apps = await context.getAvailableApps();
    if (!apps.length) {
      this.log(dedent`
          It doesn't look like you have any applications.

          Visit https://gadget.new to create one!
      `);
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
      },
    );
  }
}
