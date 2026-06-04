import { err, ok, type Result } from "neverthrow";
import { type AppError, appError } from "../errors/app-error.js";

export type QueryRunOptions = {
  readonly dataSourceId: string;
  readonly sql: string;
  readonly format?: string;
  readonly profile?: string;
};

export type ValidQueryRunOptions = {
  readonly dataSourceId: number;
  readonly sql: string;
  readonly format?: string;
  readonly profile?: string;
};

export const validateQueryRunOptions = (
  options: QueryRunOptions,
): Result<ValidQueryRunOptions, AppError> => {
  const dataSourceId = Number(options.dataSourceId);

  if (!Number.isInteger(dataSourceId) || dataSourceId <= 0) {
    return err(appError("validation_error", "Data source id must be a positive integer."));
  }

  if (options.sql.trim().length === 0) {
    return err(appError("validation_error", "SQL is required."));
  }

  return ok({
    dataSourceId,
    sql: options.sql,
    format: options.format,
    profile: options.profile,
  });
};
