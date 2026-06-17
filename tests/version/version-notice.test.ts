import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultVersionStatePath, notifyVersionChange } from "../../src/version/version-notice.js";

const createIo = () => {
  let stderr = "";

  return {
    io: {
      stderr: {
        write: (chunk: string) => {
          stderr += chunk;
          return true;
        },
      },
    },
    stderr: () => stderr,
  };
};

describe("version notice", () => {
  it("uses the redash-cli state path under the home directory", () => {
    expect(defaultVersionStatePath()).toMatch(/redash-cli\/state\.json$/);
  });

  it("stores the current version silently on first startup", async () => {
    const dir = await mkdtemp(join(tmpdir(), "redash-cli-version-"));
    const statePath = join(dir, "state.json");
    const { io, stderr } = createIo();

    await notifyVersionChange({ currentVersion: "1.0.0", io, statePath });

    await expect(readFile(statePath, "utf8")).resolves.toContain('"lastSeenVersion": "1.0.0"');
    expect(stderr()).toBe("");
  });

  it("prints a notice once after the installed version changes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "redash-cli-version-"));
    const statePath = join(dir, "state.json");
    const { io, stderr } = createIo();

    await notifyVersionChange({ currentVersion: "1.0.0", io, statePath });
    await notifyVersionChange({ currentVersion: "1.1.0", io, statePath });
    await notifyVersionChange({ currentVersion: "1.1.0", io, statePath });

    expect(stderr()).toBe("redash: upgraded to version 1.1.0 (previously 1.0.0).\n");
  });

  it("treats invalid state files as first startup", async () => {
    const dir = await mkdtemp(join(tmpdir(), "redash-cli-version-"));
    const statePath = join(dir, "state.json");
    const { io, stderr } = createIo();

    await writeFile(statePath, "{", "utf8");

    await notifyVersionChange({ currentVersion: "1.0.0", io, statePath });

    expect(stderr()).toBe("");
    await expect(readFile(statePath, "utf8")).resolves.toContain('"lastSeenVersion": "1.0.0"');
  });

  it("ignores state write failures", async () => {
    const dir = await mkdtemp(join(tmpdir(), "redash-cli-version-"));
    const fileParent = join(dir, "file-parent");
    const statePath = join(fileParent, "state.json");
    const { io, stderr } = createIo();

    await writeFile(fileParent, "", "utf8");
    await notifyVersionChange({ currentVersion: "1.0.0", io, statePath });

    expect(stderr()).toBe("");
  });
});
