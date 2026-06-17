export type AppErrorCode =
  | "config_invalid"
  | "config_write_failed"
  | "keychain_failed"
  | "profile_not_found"
  | "redash_http_error"
  | "redash_invalid_response"
  | "redash_job_failed"
  | "redash_job_timeout"
  | "validation_error";

export type AppError = {
  readonly code: AppErrorCode;
  readonly message: string;
  readonly cause?: unknown;
};

export const appError = (code: AppErrorCode, message: string, cause?: unknown): AppError => ({
  code,
  message,
  cause,
});
