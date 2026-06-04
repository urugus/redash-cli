#!/usr/bin/env node
import { createProgram } from "./cli/program.js";

export const main = async (): Promise<void> => {
  await createProgram().parseAsync(process.argv);
};

await main();
