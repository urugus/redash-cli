import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultConfigPath,
  readConfigFile,
  writeConfigFile,
} from "../../src/config/config-store.js";

describe("config store", () => {
  it("uses the redash-cli config path under the home directory", () => {
    expect(defaultConfigPath()).toMatch(/redash-cli[\\/]config\.json$/);
  });

  it("returns an empty config when the config file does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "redash-cli-config-"));
    const result = await readConfigFile(join(dir, "missing", "config.json"));

    expect(result.isOk()).toBe(true);
    expect(result.value).toEqual({ profiles: {} });
  });

  it("reads an existing config file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "redash-cli-config-"));
    const path = join(dir, "config.json");

    await writeFile(
      path,
      JSON.stringify({
        defaultProfile: "default",
        profiles: {
          default: {
            url: "https://redash.example.com",
          },
        },
      }),
      "utf8",
    );

    const result = await readConfigFile(path);

    expect(result.isOk()).toBe(true);
    expect(result.value).toEqual({
      defaultProfile: "default",
      profiles: {
        default: {
          url: "https://redash.example.com",
        },
      },
    });
  });

  it("wraps read errors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "redash-cli-config-"));
    const result = await readConfigFile(dir);

    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe("config_invalid");
  });

  it("writes config files and creates parent directories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "redash-cli-config-"));
    const path = join(dir, "nested", "config.json");

    const result = await writeConfigFile(
      {
        defaultProfile: "default",
        profiles: {
          default: {
            url: "https://redash.example.com",
          },
        },
      },
      path,
    );

    expect(result.isOk()).toBe(true);
    await expect(readFile(path, "utf8")).resolves.toContain('"defaultProfile": "default"');
  });

  it("wraps write errors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "redash-cli-config-"));
    const fileParent = join(dir, "file-parent");
    await writeFile(fileParent, "", "utf8");

    const result = await writeConfigFile({ profiles: {} }, join(fileParent, "config.json"));

    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe("config_write_failed");
  });
});
