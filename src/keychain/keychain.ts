import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ResultAsync } from "neverthrow";
import { type AppError, appError } from "../errors/app-error.js";

const execFileAsync = promisify(execFile);
const serviceName = "redash-cli";
const securityPath = "/usr/bin/security";

export type SecurityCommand = {
  readonly file: string;
  readonly args: readonly string[];
};

export const keychainAccount = (profile: string): string => `${profile}:api-key`;

export const buildSaveApiKeyCommand = (profile: string, apiKey: string): SecurityCommand => ({
  file: securityPath,
  args: [
    "add-generic-password",
    "-a",
    keychainAccount(profile),
    "-s",
    serviceName,
    "-w",
    apiKey,
    "-U",
  ],
});

export const buildReadApiKeyCommand = (profile: string): SecurityCommand => ({
  file: securityPath,
  args: ["find-generic-password", "-a", keychainAccount(profile), "-s", serviceName, "-w"],
});

export const saveApiKey = (profile: string, apiKey: string): ResultAsync<void, AppError> => {
  const command = buildSaveApiKeyCommand(profile, apiKey);

  return ResultAsync.fromPromise(
    execFileAsync(command.file, [...command.args]).then(() => undefined),
    (cause) => appError("keychain_failed", `Failed to save API key for profile: ${profile}`, cause),
  );
};

export const readApiKey = (profile: string): ResultAsync<string, AppError> => {
  const command = buildReadApiKeyCommand(profile);

  return ResultAsync.fromPromise(
    execFileAsync(command.file, [...command.args]).then(({ stdout }) => stdout.trim()),
    (cause) => appError("keychain_failed", `Failed to read API key for profile: ${profile}`, cause),
  );
};
