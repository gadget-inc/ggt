#!/usr/bin/env node

import process from "node:process";
import oclif from "@oclif/core";

process.on("unhandledRejection", oclif.Errors.handle);

oclif
  .run(process.argv.slice(2), import.meta.url)
  .then(() => oclif.flush())
  .catch(oclif.Errors.handle);
