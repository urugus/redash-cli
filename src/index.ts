#!/usr/bin/env node
import { createProgram } from "./cli/program.js";
import { readPackageVersion } from "./version/package-info.js";
import { notifyVersionChange } from "./version/version-notice.js";

export const main = async (): Promise<void> => {
  const version = await readPackageVersion();
  const io = { stdout: process.stdout, stderr: process.stderr };

  await notifyVersionChange({ currentVersion: version, io });
  await createProgram({ io, version }).parseAsync(process.argv);
};

await main();
