import { err, ok, Result, ResultAsync } from "neverthrow";
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

export type DashboardListInput = {
  readonly page: number;
  readonly pageSize: number;
  readonly order: string;
};

export type InviteUserInput = {
  readonly name: string;
  readonly email: string;
  readonly sendEmail: boolean;
};

const invitedUserSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    email: z.string(),
    is_invitation_pending: z.boolean().optional(),
    invite_link: z.string().optional(),
  })
  .passthrough();

export type InvitedUser = z.infer<typeof invitedUserSchema>;

const rowSchema = z.record(z.string(), z.unknown());
const rowsSchema = z.array(rowSchema);

const dataSourceSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
});

const dataSourcesSchema = z.array(dataSourceSchema);

const dashboardSummarySchema = z
  .object({
    id: z.number(),
    name: z.string(),
    slug: z.string(),
    is_archived: z.boolean().optional(),
    is_draft: z.boolean().optional(),
    updated_at: z.string().optional(),
    created_at: z.string().optional(),
  })
  .passthrough();

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;

const dashboardSchema = dashboardSummarySchema.extend({
  widgets: z.array(z.unknown()).optional(),
  visualizations: z.array(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  user: z.unknown().optional(),
});

export type Dashboard = z.infer<typeof dashboardSchema>;

const dashboardArraySchema = z.array(dashboardSummarySchema);
const dashboardListEnvelopeSchema = z
  .object({
    count: z.number().optional(),
    page: z.number().optional(),
    page_size: z.number().optional(),
    results: dashboardArraySchema,
  })
  .passthrough();

export type DashboardList = z.infer<typeof dashboardListEnvelopeSchema>;

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

const maxDashboardPageSize = 250;
const redactedValue = "[REDACTED]";
const sensitiveFieldNames = new Set([
  "accesstoken",
  "apikey",
  "clientsecret",
  "password",
  "privatekey",
  "publicurl",
  "refreshtoken",
  "secret",
  "token",
]);
const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ensure = <T>(
  value: T,
  predicate: (value: T) => boolean,
  error: AppError,
): Result<T, AppError> => (predicate(value) ? ok(value) : err(error));

const parseSchema = <T>(
  schema: z.ZodType<T>,
  value: unknown,
  message: string,
): Result<T, AppError> => {
  const parsed = schema.safeParse(value);

  return parsed.success
    ? ok(parsed.data)
    : err(appError("redash_invalid_response", message, parsed.error));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeFieldName = (name: string): string =>
  name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

const isSensitiveFieldName = (name: string): boolean =>
  sensitiveFieldNames.has(normalizeFieldName(name));

const redactSensitiveFields = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveFields(item)) as T;
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      isSensitiveFieldName(key) ? redactedValue : redactSensitiveFields(nestedValue),
    ]),
  ) as T;
};

const decodeJson = (value: unknown, context: string): Result<unknown, AppError> => {
  if (value == null) {
    return err(appError("redash_invalid_response", `Redash returned empty JSON for ${context}.`));
  }

  return ok(value);
};

const decodeRows = (value: unknown, context: string): Result<readonly Row[], AppError> =>
  parseSchema(
    queryResultEnvelopeSchema,
    value,
    `Redash rows response is invalid for ${context}.`,
  ).map((envelope) => envelope.query_result.data.rows);

const decodeDataSources = (value: unknown): Result<readonly DataSource[], AppError> =>
  parseSchema(dataSourcesSchema, value, "Redash data sources response is invalid.");

const decodeDashboardEnvelope = (value: unknown): Result<DashboardList, AppError> =>
  parseSchema(dashboardListEnvelopeSchema, value, "Redash dashboards response is invalid.");

const decodeDashboardArray = (value: unknown): Result<DashboardList, AppError> =>
  parseSchema(dashboardArraySchema, value, "Redash dashboards response is invalid.").map(
    (results) => ({ results }),
  );

const decodeDashboardList = (value: unknown): Result<DashboardList, AppError> =>
  decodeDashboardEnvelope(value).orElse(() => decodeDashboardArray(value));

const decodeDashboard = (value: unknown): Result<Dashboard, AppError> =>
  parseSchema(dashboardSchema, value, "Redash dashboard response is invalid.").map((dashboard) =>
    redactSensitiveFields(dashboard),
  );

const decodeInvitedUser = (value: unknown): Result<InvitedUser, AppError> =>
  parseSchema(invitedUserSchema, value, "Redash user invite response is invalid.");

const decodeQueryRunResponse = (
  value: unknown,
): Result<z.infer<typeof queryRunResponseSchema>, AppError> =>
  parseSchema(queryRunResponseSchema, value, "Redash query run response is invalid.");

type JobPollOutcome =
  | { readonly kind: "complete"; readonly queryResultId: number }
  | { readonly kind: "pending" };

const decodeJobOutcome = (value: unknown): Result<JobPollOutcome, AppError> =>
  parseSchema(jobResponseSchema, value, "Redash job response is invalid.").andThen(({ job }) => {
    if (job.status === 3 && job.query_result_id != null) {
      return ok<JobPollOutcome, AppError>({
        kind: "complete",
        queryResultId: job.query_result_id,
      });
    }

    if (job.status === 4) {
      return err(appError("redash_job_failed", job.error ?? "Redash query job failed."));
    }

    return ok<JobPollOutcome, AppError>({ kind: "pending" });
  });

const validateDashboardPositiveInteger = (value: number, field: string): Result<number, AppError> =>
  ensure(
    value,
    (current) => Number.isSafeInteger(current) && current >= 1,
    appError("validation_error", `${field} must be a positive integer.`),
  );

const validateDashboardPageSize = (pageSize: number): Result<number, AppError> =>
  ensure(
    pageSize,
    (current) => current <= maxDashboardPageSize,
    appError(
      "validation_error",
      `Page size must be less than or equal to ${maxDashboardPageSize}.`,
    ),
  );

const validateDashboardRequiredText = (value: string, field: string): Result<string, AppError> =>
  ok<string, AppError>(value.trim()).andThen((trimmed) =>
    ensure(
      trimmed,
      (current) => current.length > 0,
      appError("validation_error", `${field} is required.`),
    ),
  );

const buildDashboardListQuery = ([page, pageSize, order]: [
  number,
  number,
  string,
]): URLSearchParams =>
  new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    order,
  });

const buildDashboardListPath = (input: DashboardListInput): Result<string, AppError> =>
  Result.combine([
    validateDashboardPositiveInteger(input.page, "Page"),
    validateDashboardPositiveInteger(input.pageSize, "Page size").andThen(
      validateDashboardPageSize,
    ),
    validateDashboardRequiredText(input.order, "Order"),
  ]).map((values) => `/api/dashboards?${buildDashboardListQuery(values)}`);

const buildDashboardPath = (slug: string): Result<string, AppError> =>
  validateDashboardRequiredText(slug, "Dashboard slug").map(
    (trimmed) => `/api/dashboards/${encodeURIComponent(trimmed)}`,
  );

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
      if (response.status === 403) {
        return err(
          appError(
            "redash_http_error",
            `Redash HTTP 403: ${path}. The API key may not have permission for this operation.`,
          ),
        );
      }

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
    requestJson(baseUrl, apiKey, fetchImpl, `/api/jobs/${jobId}`)
      .andThen((json) => decodeJobOutcome(json))
      .andThen((outcome) => {
        if (outcome.kind === "complete") {
          return ok(outcome.queryResultId);
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
  readonly listDashboards: (input: DashboardListInput) => ResultAsync<DashboardList, AppError>;
  readonly getDashboard: (slug: string) => ResultAsync<Dashboard, AppError>;
  readonly inviteUser: (input: InviteUserInput) => ResultAsync<InvitedUser, AppError>;
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
    requestJson(baseUrl, apiKey, fetchImpl, "/api/data_sources").andThen((json) =>
      decodeDataSources(json),
    );

  const listDashboards = (input: DashboardListInput): ResultAsync<DashboardList, AppError> =>
    buildDashboardListPath(input)
      .asyncAndThen((path) => requestJson(baseUrl, apiKey, fetchImpl, path))
      .andThen((json) => decodeDashboardList(json));

  const getDashboard = (slug: string): ResultAsync<Dashboard, AppError> =>
    buildDashboardPath(slug)
      .asyncAndThen((path) => requestJson(baseUrl, apiKey, fetchImpl, path))
      .andThen((json) => decodeDashboard(json));

  const inviteUser = (input: InviteUserInput): ResultAsync<InvitedUser, AppError> => {
    const path = input.sendEmail ? "/api/users" : "/api/users?no_invite";

    return requestJson(baseUrl, apiKey, fetchImpl, path, {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        email: input.email,
      }),
    }).andThen((json) => decodeInvitedUser(json));
  };

  const runQuery = (dataSourceId: number, sql: string): ResultAsync<readonly Row[], AppError> =>
    requestJson(baseUrl, apiKey, fetchImpl, "/api/query_results", {
      method: "POST",
      body: JSON.stringify({
        data_source_id: dataSourceId,
        query: sql,
        max_age: 0,
      }),
    })
      .andThen((json) => decodeQueryRunResponse(json))
      .andThen((response) => {
        if ("query_result" in response) {
          return decodeRows(response, "query run");
        }

        return pollJob(
          baseUrl,
          apiKey,
          fetchImpl,
          sleep,
          response.job.id,
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
    listDashboards,
    getDashboard,
    inviteUser,
    runQuery,
  };
};
