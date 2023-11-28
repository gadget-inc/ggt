import { command as root } from "./commands/root.js";
import { installErrorHandlers } from "./services/error/report.js";

installErrorHandlers();

await root();
