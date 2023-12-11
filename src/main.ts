import { command as root } from "./commands/root.js";
import { installErrorHandlers } from "./services/output/report.js";

installErrorHandlers();

await root();
