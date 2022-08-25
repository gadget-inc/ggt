import type { Config } from "@oclif/core";

/**
 * A reference to oclif's {@linkcode Config}.
 *
 * By default, oclif's {@linkcode Config} is only available as an instance property on a Command, but we want to be able to access it from
 * anywhere. To do this, we created this global variable that references the Config. It is set by the init function in the BaseCommand.
 */
export let config: Config;

export function setConfig(value: Config): void {
  config = value;
}
