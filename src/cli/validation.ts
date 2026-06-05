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
