import { defineCommand } from "../services/command/command.ts";
import colors from "../services/output/colors.ts";
import { println } from "../services/output/print.ts";
import { sprint } from "../services/output/sprint.ts";
import { packageJson } from "../services/util/package-json.ts";

export default defineCommand({
  name: "version",
  description: "Print the currently installed version",
  details: sprint`
    Prints the currently installed version number. ggt checks for updates
    automatically and prints a notice when a newer version is available.
  `,
  sections: [
    {
      title: "Updating ggt",
      content: sprint`
        ggt notifies you when an update is available. To update, run
        ${colors.identifier("npm install -g ggt@latest")}. To install an experimental build, run
        ${colors.identifier("npm install -g ggt@experimental")}.
      `,
    },
  ],
  examples: ["ggt version"],
  run: (): void => {
    println(packageJson.version);
  },
});
