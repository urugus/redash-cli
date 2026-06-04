import { describe, expect, it } from "vitest";
import {
  buildReadApiKeyCommand,
  buildSaveApiKeyCommand,
  keychainAccount,
} from "../../src/keychain/keychain.js";

describe("keychain", () => {
  it("builds a profile scoped account name", () => {
    expect(keychainAccount("ey")).toBe("ey:api-key");
  });

  it("builds the save command", () => {
    expect(buildSaveApiKeyCommand("ey", "secret")).toEqual({
      file: "/usr/bin/security",
      args: ["add-generic-password", "-a", "ey:api-key", "-s", "redash-cli", "-w", "secret", "-U"],
    });
  });

  it("builds the read command", () => {
    expect(buildReadApiKeyCommand("ey")).toEqual({
      file: "/usr/bin/security",
      args: ["find-generic-password", "-a", "ey:api-key", "-s", "redash-cli", "-w"],
    });
  });
});
