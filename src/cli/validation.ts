import { err, ok, type Result } from "neverthrow";
import { type AppError, appError } from "../errors/app-error.js";

export type QueryRunOptions = {
  readonly dataSourceId: string;
  readonly sql: string;
  readonly format?: string;
  readonly profile?: string;
};

export type QueryExplainOptions = {
  readonly dataSourceId: string;
  readonly sql: string;
  readonly profile?: string;
};

export type UserInviteOptions = {
  readonly name: string;
  readonly email: string;
  readonly sendEmail?: boolean;
  readonly profile?: string;
};

export type ValidQueryRunOptions = {
  readonly dataSourceId: number;
  readonly sql: string;
  readonly format?: string;
  readonly profile?: string;
};

export type ValidQueryExplainOptions = {
  readonly dataSourceId: number;
  readonly sql: string;
  readonly profile?: string;
};

export type ValidUserInviteOptions = {
  readonly name: string;
  readonly email: string;
  readonly sendEmail: boolean;
  readonly profile?: string;
};

const validateDataSourceId = (value: string): Result<number, AppError> => {
  const dataSourceId = Number(value);

  if (!Number.isInteger(dataSourceId) || dataSourceId <= 0) {
    return err(appError("validation_error", "Data source id must be a positive integer."));
  }

  return ok(dataSourceId);
};

const validateSql = (sql: string): Result<string, AppError> => {
  if (sql.trim().length === 0) {
    return err(appError("validation_error", "SQL is required."));
  }

  return ok(sql);
};

const validateRequiredText = (value: string, field: string): Result<string, AppError> => {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return err(appError("validation_error", `${field} is required.`));
  }

  return ok(trimmed);
};

const validateEmail = (email: string): Result<string, AppError> =>
  validateRequiredText(email, "Email").andThen((trimmed) => {
    if (!trimmed.includes("@")) {
      return err(appError("validation_error", "Email must include @."));
    }

    return ok(trimmed);
  });

export const validateQueryRunOptions = (
  options: QueryRunOptions,
): Result<ValidQueryRunOptions, AppError> =>
  validateDataSourceId(options.dataSourceId).andThen((dataSourceId) =>
    validateSql(options.sql).map((sql) => ({
      dataSourceId,
      sql,
      format: options.format,
      profile: options.profile,
    })),
  );

export const validateQueryExplainOptions = (
  options: QueryExplainOptions,
): Result<ValidQueryExplainOptions, AppError> =>
  validateDataSourceId(options.dataSourceId).andThen((dataSourceId) =>
    validateSql(options.sql).map((sql) => ({
      dataSourceId,
      sql,
      profile: options.profile,
    })),
  );

export const validateUserInviteOptions = (
  options: UserInviteOptions,
): Result<ValidUserInviteOptions, AppError> =>
  validateRequiredText(options.name, "Name").andThen((name) =>
    validateEmail(options.email).map((email) => ({
      name,
      email,
      sendEmail: options.sendEmail !== false,
      profile: options.profile,
    })),
  );
