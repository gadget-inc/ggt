#!/usr/bin/env node

import oclif from "@oclif/core";
import process from "node:process";

process.on("unhandledRejection", oclif.Errors.handle);

oclif
  .run(process.argv.slice(2), import.meta.url)
  .then(() => oclif.flush())
  .catch(oclif.Errors.handle);
