import { describe, expect, it, vi } from "vitest";

const childProcessMock = vi.hoisted(() => ({
  execFile: Object.assign(vi.fn(), {
    [Symbol.for("nodejs.util.promisify.custom")]: vi.fn(),
  }),
}));

vi.mock("node:child_process", () => ({
  execFile: childProcessMock.execFile,
}));

const { readApiKey, saveApiKey } = await import("../../src/keychain/keychain.js");

describe("keychain command execution", () => {
  it("saves an API key through the security command", async () => {
    childProcessMock.execFile[Symbol.for("nodejs.util.promisify.custom")].mockResolvedValueOnce({
      stdout: "",
      stderr: "",
    });

    const result = await saveApiKey("default", "secret");

    expect(result.isOk()).toBe(true);
    expect(
      childProcessMock.execFile[Symbol.for("nodejs.util.promisify.custom")],
    ).toHaveBeenCalledWith("/usr/bin/security", [
      "add-generic-password",
      "-a",
      "default:api-key",
      "-s",
      "redash-cli",
      "-w",
      "secret",
      "-U",
    ]);
  });

  it("reads and trims an API key through the security command", async () => {
    childProcessMock.execFile[Symbol.for("nodejs.util.promisify.custom")].mockResolvedValueOnce({
      stdout: " secret\n",
      stderr: "",
    });

    const result = await readApiKey("default");

    expect(result.isOk()).toBe(true);
    expect(result.value).toBe("secret");
  });

  it("wraps security command failures", async () => {
    childProcessMock.execFile[Symbol.for("nodejs.util.promisify.custom")].mockRejectedValueOnce(
      new Error("security failed"),
    );

    const result = await readApiKey("default");

    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe("keychain_failed");
  });

  it("wraps security command failures when saving", async () => {
    childProcessMock.execFile[Symbol.for("nodejs.util.promisify.custom")].mockRejectedValueOnce(
      new Error("security failed"),
    );

    const result = await saveApiKey("default", "secret");

    expect(result.isErr()).toBe(true);
    expect(result.error.message).toBe("Failed to save API key for profile: default");
  });
});
