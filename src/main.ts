process.setSourceMapsEnabled(true);

const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  console.error(`ggt requires Node.js v22 or later, but you're running v${process.versions.node}.`);
  console.error("");
  console.error("To upgrade Node.js, pick whichever method you used to install it:");
  console.error("");
  console.error("  nvm:        nvm install 22 && nvm use 22");
  console.error("  fnm:        fnm install 22 && fnm use 22");
  console.error("  Homebrew:   brew upgrade node");
  console.error("  Installer:  https://nodejs.org/en/download");
  console.error("");
  console.error("After upgrading, run ggt again.");
  process.exit(1);
}

const { ggt } = await import("./ggt.ts");
await ggt();
