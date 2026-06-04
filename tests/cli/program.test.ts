import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { createProgram } from "../../src/cli/program.js";

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json") as { version: string };

describe("CLI program", () => {
  it("uses the package version", () => {
    expect(createProgram().version()).toBe(packageJson.version);
  });
});
