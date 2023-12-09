import arg from "arg";
import { CLIError, IsBug, UnexpectedError } from "../output/report.js";
import { defaults as withDefaults } from "../util/object.js";

export const parseArgs = <Spec extends arg.Spec, Args extends arg.Result<Spec>, Defaults extends Partial<Args>>({
  args,
  defaults,
  options,
}: {
  args: Spec;
  defaults?: Defaults;
  options?: arg.Options;
}): Defaults & Args => {
  try {
    const parsed = arg(args, options);
    return withDefaults(parsed, defaults ?? {}) as Defaults & Args;
  } catch (error: unknown) {
    if (error instanceof arg.ArgError) {
      // convert arg.ArgError to CLIError
      throw new ArgError(error.message);
    }
    throw new UnexpectedError(error);
  }
};

export class ArgError extends CLIError {
  isBug = IsBug.NO;

  protected override render(): string {
    return this.message;
  }
}
