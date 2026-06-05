import { err, ok, type Result } from "neverthrow";
import { type AppError, appError } from "../errors/app-error.js";
import type { Row } from "../output/format.js";
import type { DataSource } from "../redash/client.js";

export type ExplainSummary = {
  readonly nodeType: string;
  readonly planRows: number;
  readonly totalCost: number;
};

export type ExplainOutput = {
  readonly summary: ExplainSummary;
  readonly plan: unknown;
};

const supportedPostgresTypes = new Set(["pg", "postgres", "postgresql"]);

const isIdentifierChar = (char: string | undefined): boolean =>
  char != null && /[A-Za-z0-9_$]/.test(char);

const dollarQuoteTagAt = (sql: string, index: number): string | undefined => {
  const match = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);

  return match?.[0];
};

const isEscapeStringStart = (sql: string, index: number): boolean => {
  const char = sql[index];

  return (
    (char === "E" || char === "e") && sql[index + 1] === "'" && !isIdentifierChar(sql[index - 1])
  );
};

const scanSingleQuotedString = (
  sql: string,
  quoteIndex: number,
  backslashEscapes: boolean,
): number => {
  let index = quoteIndex + 1;

  while (index < sql.length) {
    if (backslashEscapes && sql[index] === "\\" && index + 1 < sql.length) {
      index += 2;
      continue;
    }

    if (sql[index] === "'" && sql[index + 1] === "'") {
      index += 2;
      continue;
    }

    if (sql[index] === "'") {
      return index + 1;
    }

    index += 1;
  }

  return index;
};

const semicolonIndexesOutsideSqlSyntax = (sql: string): readonly number[] => {
  const semicolonIndexes: number[] = [];
  let index = 0;

  while (index < sql.length) {
    const char = sql[index];
    const nextChar = sql[index + 1];

    if (isEscapeStringStart(sql, index)) {
      index = scanSingleQuotedString(sql, index + 1, true);
      continue;
    }

    if (char === "'") {
      index = scanSingleQuotedString(sql, index, false);
      continue;
    }

    if (char === '"') {
      index += 1;
      while (index < sql.length) {
        if (sql[index] === '"' && sql[index + 1] === '"') {
          index += 2;
          continue;
        }
        if (sql[index] === '"') {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (char === "-" && nextChar === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") {
        index += 1;
      }
      continue;
    }

    if (char === "/" && nextChar === "*") {
      index += 2;
      while (index < sql.length) {
        if (sql[index] === "*" && sql[index + 1] === "/") {
          index += 2;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (char === "$") {
      const tag = dollarQuoteTagAt(sql, index);
      if (tag != null) {
        const closingIndex = sql.indexOf(tag, index + tag.length);
        if (closingIndex === -1) {
          index += tag.length;
        } else {
          index = closingIndex + tag.length;
        }
        continue;
      }
    }

    if (char === ";") {
      semicolonIndexes.push(index);
    }

    index += 1;
  }

  return semicolonIndexes;
};

const leadingKeyword = (sql: string): string | undefined => {
  let index = 0;

  while (index < sql.length) {
    const char = sql[index];
    const nextChar = sql[index + 1];

    if (/\s/.test(char) || char === "(") {
      index += 1;
      continue;
    }

    if (char === "-" && nextChar === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") {
        index += 1;
      }
      continue;
    }

    if (char === "/" && nextChar === "*") {
      index += 2;
      while (index < sql.length) {
        if (sql[index] === "*" && sql[index + 1] === "/") {
          index += 2;
          break;
        }
        index += 1;
      }
      continue;
    }

    return sql
      .slice(index)
      .match(/^([a-z]+)/i)?.[1]
      ?.toLowerCase();
  }

  return undefined;
};

export const buildPostgresExplainSql = (sql: string): Result<string, AppError> => {
  let normalizedSql = sql.trim();

  if (normalizedSql.length === 0) {
    return err(appError("validation_error", "SQL is required."));
  }

  const semicolonIndexes = semicolonIndexesOutsideSqlSyntax(normalizedSql);
  const trailingTerminator = semicolonIndexes.at(-1);

  if (trailingTerminator != null && semicolonIndexes.length === 1) {
    if (normalizedSql.slice(trailingTerminator + 1).trim().length === 0) {
      normalizedSql = normalizedSql.slice(0, trailingTerminator).trimEnd();
    }
  }

  if (semicolonIndexesOutsideSqlSyntax(normalizedSql).length > 0) {
    return err(appError("validation_error", "EXPLAIN only supports a single SQL statement."));
  }

  const firstToken = leadingKeyword(normalizedSql);

  if (firstToken !== "select" && firstToken !== "with") {
    return err(appError("validation_error", "EXPLAIN only supports SELECT or WITH queries."));
  }

  return ok(`EXPLAIN (FORMAT JSON)\n${normalizedSql}`);
};

export const findPostgresDataSource = (
  dataSources: readonly DataSource[],
  dataSourceId: number,
): Result<DataSource, AppError> => {
  const dataSource = dataSources.find((source) => source.id === dataSourceId);

  if (dataSource == null) {
    return err(appError("validation_error", `Data source not found: ${dataSourceId}`));
  }

  if (!supportedPostgresTypes.has(dataSource.type.toLowerCase())) {
    return err(
      appError("validation_error", "This command currently supports PostgreSQL data sources only."),
    );
  }

  return ok(dataSource);
};

const parsePlanCandidate = (candidate: unknown): Result<unknown, AppError> => {
  if (typeof candidate === "string") {
    try {
      return ok(JSON.parse(candidate) as unknown);
    } catch (cause) {
      return err(
        appError("redash_invalid_response", "Failed to parse PostgreSQL EXPLAIN JSON.", cause),
      );
    }
  }

  if (candidate != null && (Array.isArray(candidate) || typeof candidate === "object")) {
    return ok(candidate);
  }

  return err(appError("redash_invalid_response", "PostgreSQL EXPLAIN result is invalid."));
};

const getPlanRoot = (plan: unknown): Result<Record<string, unknown>, AppError> => {
  const topLevel = Array.isArray(plan) ? plan[0] : plan;

  if (topLevel == null || typeof topLevel !== "object" || Array.isArray(topLevel)) {
    return err(appError("redash_invalid_response", "PostgreSQL EXPLAIN plan is invalid."));
  }

  const root = (topLevel as Record<string, unknown>).Plan;

  if (root == null || typeof root !== "object" || Array.isArray(root)) {
    return err(appError("redash_invalid_response", "PostgreSQL EXPLAIN plan root is invalid."));
  }

  return ok(root as Record<string, unknown>);
};

const buildExplainSummary = (plan: unknown): Result<ExplainSummary, AppError> =>
  getPlanRoot(plan).andThen((root) => {
    const nodeType = root["Node Type"];
    const planRows = root["Plan Rows"];
    const totalCost = root["Total Cost"];

    if (
      typeof nodeType !== "string" ||
      typeof planRows !== "number" ||
      typeof totalCost !== "number"
    ) {
      return err(appError("redash_invalid_response", "PostgreSQL EXPLAIN summary is invalid."));
    }

    return ok({
      nodeType,
      planRows,
      totalCost,
    });
  });

export const decodePostgresExplainRows = (
  rows: readonly Row[],
): Result<ExplainOutput, AppError> => {
  const firstRow = rows[0];

  if (firstRow == null) {
    return err(appError("redash_invalid_response", "PostgreSQL EXPLAIN returned no rows."));
  }

  const candidate = firstRow["QUERY PLAN"] ?? Object.values(firstRow)[0];

  return parsePlanCandidate(candidate).andThen((plan) =>
    buildExplainSummary(plan).map((summary) => ({
      summary,
      plan,
    })),
  );
};
