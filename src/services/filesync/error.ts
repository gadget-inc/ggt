import { CLIError, IsBug } from "../output/report.js";
import { sprint } from "../output/sprint.js";

export class YarnNotFoundError extends CLIError {
  isBug = IsBug.NO;

  constructor() {
    super("Yarn not found");
  }

  protected render(): string {
    return sprint`
      Yarn must be installed to sync your application. You can install it by running:

        $ npm install --global yarn

      For more information, see: https://classic.yarnpkg.com/en/docs/install
    `;
  }
}

export class InvalidSyncFileError extends CLIError {
  isBug = IsBug.NO;

  constructor(
    readonly dir: string,
    readonly app: string | undefined,
  ) {
    super("The .gadget/sync.json file was invalid or not found");
    this.app ??= "<name of app>";
  }

  protected render(): string {
    return sprint`
      We failed to find a ".gadget/sync.json" file in this directory:

        ${this.dir}

      If you're running 'ggt sync' for the first time, we recommend
      using a gadget specific directory like this:

        ggt sync ~/gadget/${this.app} --app ${this.app}

      If you're certain you want to sync the contents of that directory
      to Gadget, run 'ggt sync' again with the {bold --force} flag:

        ggt sync ${this.dir} --app ${this.app} --force
    `;
  }
}
