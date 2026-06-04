import { err, ok, type Result } from "neverthrow";
import { type AppError, appError } from "../errors/app-error.js";

export type OutputFormat = "json" | "csv";
export type Row = Readonly<Record<string, unknown>>;

export const parseOutputFormat = (value: string | undefined): Result<OutputFormat, AppError> => {
  if (value == null || value === "json") {
    return ok("json");
  }

  if (value === "csv") {
    return ok("csv");
  }

  return err(appError("validation_error", `Unsupported output format: ${value}`));
};

export const formatJson = (rows: readonly Row[]): string => `${JSON.stringify(rows, null, 2)}\n`;

const csvValue = (value: unknown): string => {
  if (value == null) {
    return "";
  }

  const text = typeof value === "string" ? value : JSON.stringify(value);
  const shouldQuote =
    text.includes(",") || text.includes('"') || text.includes("\n") || text.includes("\r");

  if (!shouldQuote) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
};

export const csvColumns = (rows: readonly Row[]): readonly string[] => {
  const seen = new Set<string>();
  const columns: string[] = [];

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  return columns;
};

export const formatCsv = (rows: readonly Row[]): string => {
  const columns = csvColumns(rows);

  if (columns.length === 0) {
    return "\n";
  }

  const header = columns.map(csvValue).join(",");
  const body = rows.map((row) => columns.map((column) => csvValue(row[column])).join(","));

  return `${[header, ...body].join("\n")}\n`;
};

export const formatRows = (rows: readonly Row[], format: OutputFormat): string =>
  format === "json" ? formatJson(rows) : formatCsv(rows);
