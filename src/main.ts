import { command as root } from "./commands/root.js";
import { installErrorHandlers } from "./services/output/report.js";
import { installJsonExtensions } from "./services/util/json.js";

installErrorHandlers();
installJsonExtensions();

await root();
