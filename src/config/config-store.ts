import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { ResultAsync } from "neverthrow";
import { type AppError, appError } from "../errors/app-error.js";
import { type CliConfig, emptyConfig, parseConfigText, serializeConfig } from "./config.js";

export const defaultConfigPath = (): string =>
  join(homedir(), ".config", "redash-cli", "config.json");

export const readConfigFile = (path = defaultConfigPath()): ResultAsync<CliConfig, AppError> =>
  ResultAsync.fromPromise(
    readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return serializeConfig(emptyConfig());
      }

      throw error;
    }),
    (cause) => appError("config_invalid", `Failed to read config: ${path}`, cause),
  ).andThen((text) =>
    ResultAsync.fromSafePromise(Promise.resolve(parseConfigText(text))).andThen((result) => result),
  );

export const writeConfigFile = (
  config: CliConfig,
  path = defaultConfigPath(),
): ResultAsync<void, AppError> =>
  ResultAsync.fromPromise(
    mkdir(dirname(path), { recursive: true }).then(() =>
      writeFile(path, serializeConfig(config), "utf8"),
    ),
    (cause) => appError("config_write_failed", `Failed to write config: ${path}`, cause),
  );
