import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import { type AppError, appError } from "../errors/app-error.js";

export type ProfileConfig = {
  readonly url: string;
};

export type CliConfig = {
  readonly defaultProfile?: string;
  readonly profiles: Readonly<Record<string, ProfileConfig>>;
};

const profileNameSchema = z.string().trim().min(1);

const cliConfigSchema = z
  .object({
    defaultProfile: z.string().optional(),
    profiles: z.record(z.string(), z.object({ url: z.string().min(1) })),
  })
  .strict();

export const emptyConfig = (): CliConfig => ({
  profiles: {},
});

export const normalizeRedashUrl = (url: string): Result<string, AppError> => {
  const trimmed = url.trim();

  if (trimmed.length === 0) {
    return err(appError("validation_error", "Redash URL is required."));
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return err(appError("validation_error", "Redash URL must start with http:// or https://."));
    }

    return ok(parsed.toString().replace(/\/$/, ""));
  } catch (cause) {
    return err(appError("validation_error", "Redash URL is invalid.", cause));
  }
};

export const parseConfigJson = (value: unknown): Result<CliConfig, AppError> => {
  const parsed = cliConfigSchema.safeParse(value);

  if (!parsed.success) {
    return err(appError("config_invalid", "Config file format is invalid.", parsed.error));
  }

  return ok(parsed.data);
};

export const parseConfigText = (text: string): Result<CliConfig, AppError> => {
  try {
    return parseConfigJson(JSON.parse(text));
  } catch (cause) {
    return err(appError("config_invalid", "Config file is not valid JSON.", cause));
  }
};

export const serializeConfig = (config: CliConfig): string =>
  `${JSON.stringify(config, null, 2)}\n`;

export const validateProfileName = (profile: string): Result<string, AppError> => {
  const parsed = profileNameSchema.safeParse(profile);

  if (!parsed.success) {
    return err(appError("validation_error", "Profile name is required.", parsed.error));
  }

  return ok(parsed.data);
};

export const upsertProfile = (config: CliConfig, profile: string, url: string): CliConfig => {
  const profiles = {
    ...config.profiles,
    [profile]: { url },
  };

  return {
    defaultProfile: config.defaultProfile ?? profile,
    profiles,
  };
};

export const setDefaultProfile = (
  config: CliConfig,
  profile: string,
): Result<CliConfig, AppError> => {
  if (config.profiles[profile] == null) {
    return err(appError("profile_not_found", `Profile not found: ${profile}`));
  }

  return ok({
    ...config,
    defaultProfile: profile,
  });
};

export const resolveProfile = (
  config: CliConfig,
  profileOption?: string,
): Result<{ readonly name: string; readonly url: string }, AppError> => {
  const profile = profileOption ?? config.defaultProfile;

  if (profile == null || profile.trim().length === 0) {
    return err(
      appError("profile_not_found", "Profile is not specified and no default profile is set."),
    );
  }

  const profileConfig = config.profiles[profile];

  if (profileConfig == null) {
    return err(appError("profile_not_found", `Profile not found: ${profile}`));
  }

  return ok({ name: profile, url: profileConfig.url });
};
