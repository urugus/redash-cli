import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { notifyVersionChange } from "../../src/version/version-notice.js";

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
});
