import { err, ok, Result, type Result as ResultType } from "neverthrow";
import { type AppError, appError } from "../errors/app-error.js";
import { nonEmptyTrimmed } from "../lib/result.js";

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

export type DashboardListOptions = {
  readonly page?: string;
  readonly pageSize?: string;
  readonly order?: string;
  readonly profile?: string;
};

export type DashboardGetOptions = {
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

export type ValidDashboardListOptions = {
  readonly page: number;
  readonly pageSize: number;
  readonly order: string;
  readonly profile?: string;
};

export type ValidDashboardGetOptions = {
  readonly slug: string;
  readonly profile?: string;
};

const maxDashboardPageSize = 250;

const validateDataSourceId = (value: string): Result<number, AppError> => {
  const dataSourceId = Number(value);

  if (!Number.isInteger(dataSourceId) || dataSourceId <= 0) {
    return err(appError("validation_error", "Data source id must be a positive integer."));
  }

  return ok(dataSourceId);
};

const validatePositiveInteger = (value: string, field: string): Result<number, AppError> => {
  if (!/^[1-9]\d*$/.test(value)) {
    return err(appError("validation_error", `${field} must be a positive integer.`));
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    return err(appError("validation_error", `${field} must be a positive integer.`));
  }

  return ok(parsed);
};

const validateDashboardPageSize = (value: string): Result<number, AppError> =>
  validatePositiveInteger(value, "Page size").andThen((pageSize) => {
    if (pageSize > maxDashboardPageSize) {
      return err(
        appError(
          "validation_error",
          `Page size must be less than or equal to ${maxDashboardPageSize}.`,
        ),
      );
    }

    return ok(pageSize);
  });

const validateSql = (sql: string): Result<string, AppError> => {
  if (sql.trim().length === 0) {
    return err(appError("validation_error", "SQL is required."));
  }

  return ok(sql);
};

const validateRequiredText = (value: string, field: string): Result<string, AppError> =>
  nonEmptyTrimmed(value, appError("validation_error", `${field} is required.`));

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

export const validateDashboardListOptions = (
  options: DashboardListOptions,
): ResultType<ValidDashboardListOptions, AppError> =>
  Result.combine([
    validatePositiveInteger(options.page ?? "1", "Page"),
    validateDashboardPageSize(options.pageSize ?? "20"),
    validateRequiredText(options.order ?? "-created_at", "Order"),
  ]).map(([page, pageSize, order]) => ({
    page,
    pageSize,
    order,
    profile: options.profile,
  }));

export const validateDashboardGetOptions = (
  slug: string,
  options: DashboardGetOptions,
): Result<ValidDashboardGetOptions, AppError> =>
  validateRequiredText(slug, "Dashboard slug").map((validSlug) => ({
    slug: validSlug,
    profile: options.profile,
  }));
