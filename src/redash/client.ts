import { err, ok, type Result, ResultAsync } from "neverthrow";
import { z } from "zod";
import { type AppError, appError } from "../errors/app-error.js";
import type { Row } from "../output/format.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type Sleep = (ms: number) => Promise<void>;

export type RedashClientOptions = {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly fetchImpl?: FetchLike;
  readonly sleep?: Sleep;
  readonly jobPollIntervalMs?: number;
  readonly jobPollMaxAttempts?: number;
};

export type DataSource = {
  readonly id: number;
  readonly name: string;
  readonly type: string;
};

const rowSchema = z.record(z.string(), z.unknown());
const rowsSchema = z.array(rowSchema);

const dataSourceSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
});

const dataSourcesSchema = z.array(dataSourceSchema);

const queryResultEnvelopeSchema = z.object({
  query_result: z.object({
    data: z.object({
      rows: rowsSchema,
    }),
  }),
});

const jobSchema = z.object({
  id: z.string(),
  status: z.number(),
  query_result_id: z.number().nullable().optional(),
  error: z.string().nullable().optional(),
});

const queryRunResponseSchema = z.union([
  queryResultEnvelopeSchema,
  z.object({
    job: jobSchema,
  }),
]);

const jobResponseSchema = z.object({
  job: jobSchema,
});

const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const decodeJson = (value: unknown, context: string): Result<unknown, AppError> => {
  if (value == null) {
    return err(appError("redash_invalid_response", `Redash returned empty JSON for ${context}.`));
  }

  return ok(value);
};

const decodeRows = (value: unknown, context: string): Result<readonly Row[], AppError> => {
  const parsed = queryResultEnvelopeSchema.safeParse(value);

  if (!parsed.success) {
    return err(
      appError(
        "redash_invalid_response",
        `Redash rows response is invalid for ${context}.`,
        parsed.error,
      ),
    );
  }

  return ok(parsed.data.query_result.data.rows);
};

const parseJsonResponse = (response: Response, context: string): ResultAsync<unknown, AppError> =>
  ResultAsync.fromPromise(response.json() as Promise<unknown>, (cause) =>
    appError("redash_invalid_response", `Failed to parse JSON for ${context}.`, cause),
  ).andThen((json) => decodeJson(json, context));

const requestJson = (
  baseUrl: string,
  apiKey: string,
  fetchImpl: FetchLike,
  path: string,
  init: RequestInit = {},
): ResultAsync<unknown, AppError> => {
  const url = `${baseUrl}${path}`;

  return ResultAsync.fromPromise(
    fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    }),
    (cause) => appError("redash_http_error", `Failed to request Redash: ${path}`, cause),
  ).andThen((response) => {
    if (!response.ok) {
      return err(appError("redash_http_error", `Redash HTTP ${response.status}: ${path}`));
    }

    return parseJsonResponse(response, path);
  });
};

const pollJob = (
  baseUrl: string,
  apiKey: string,
  fetchImpl: FetchLike,
  sleep: Sleep,
  jobId: string,
  intervalMs: number,
  maxAttempts: number,
): ResultAsync<number, AppError> => {
  const poll = (attempt: number): ResultAsync<number, AppError> =>
    requestJson(baseUrl, apiKey, fetchImpl, `/api/jobs/${jobId}`).andThen((json) => {
      const parsed = jobResponseSchema.safeParse(json);

      if (!parsed.success) {
        return err(
          appError("redash_invalid_response", "Redash job response is invalid.", parsed.error),
        );
      }

      const { job } = parsed.data;

      if (job.status === 3 && job.query_result_id != null) {
        return ok(job.query_result_id);
      }

      if (job.status === 4) {
        return err(appError("redash_job_failed", job.error ?? "Redash query job failed."));
      }

      if (attempt >= maxAttempts) {
        return err(appError("redash_job_timeout", `Redash query job timed out: ${jobId}`));
      }

      return ResultAsync.fromPromise(sleep(intervalMs), (cause) =>
        appError("redash_job_timeout", "Redash query job polling sleep failed.", cause),
      ).andThen(() => poll(attempt + 1));
    });

  return poll(1);
};

export type RedashClient = {
  readonly testAuth: () => ResultAsync<void, AppError>;
  readonly listDataSources: () => ResultAsync<readonly DataSource[], AppError>;
  readonly runQuery: (dataSourceId: number, sql: string) => ResultAsync<readonly Row[], AppError>;
};

export const createRedashClient = ({
  baseUrl,
  apiKey,
  fetchImpl = fetch,
  sleep = defaultSleep,
  jobPollIntervalMs = 1000,
  jobPollMaxAttempts = 60,
}: RedashClientOptions): RedashClient => {
  const testAuth = (): ResultAsync<void, AppError> =>
    requestJson(baseUrl, apiKey, fetchImpl, "/api/session").map(() => undefined);

  const listDataSources = (): ResultAsync<readonly DataSource[], AppError> =>
    requestJson(baseUrl, apiKey, fetchImpl, "/api/data_sources").andThen((json) => {
      const parsed = dataSourcesSchema.safeParse(json);

      if (!parsed.success) {
        return err(
          appError(
            "redash_invalid_response",
            "Redash data sources response is invalid.",
            parsed.error,
          ),
        );
      }

      return ok(parsed.data);
    });

  const runQuery = (dataSourceId: number, sql: string): ResultAsync<readonly Row[], AppError> =>
    requestJson(baseUrl, apiKey, fetchImpl, "/api/query_results", {
      method: "POST",
      body: JSON.stringify({
        data_source_id: dataSourceId,
        query: sql,
        max_age: 0,
      }),
    }).andThen((json) => {
      const parsed = queryRunResponseSchema.safeParse(json);

      if (!parsed.success) {
        return err(
          appError(
            "redash_invalid_response",
            "Redash query run response is invalid.",
            parsed.error,
          ),
        );
      }

      if ("query_result" in parsed.data) {
        return decodeRows(parsed.data, "query run");
      }

      return pollJob(
        baseUrl,
        apiKey,
        fetchImpl,
        sleep,
        parsed.data.job.id,
        jobPollIntervalMs,
        jobPollMaxAttempts,
      ).andThen((queryResultId) =>
        requestJson(baseUrl, apiKey, fetchImpl, `/api/query_results/${queryResultId}`).andThen(
          (resultJson) => decodeRows(resultJson, "query result"),
        ),
      );
    });

  return {
    testAuth,
    listDataSources,
    runQuery,
  };
};
