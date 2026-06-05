import { describe, expect, it } from "vitest";
import { validateQueryExplainOptions, validateQueryRunOptions } from "../../src/cli/validation.js";

describe("CLI validation", () => {
  it("accepts valid query run options", () => {
    const result = validateQueryRunOptions({
      dataSourceId: "1",
      sql: "select 1",
      format: "json",
    });

    expect(result.isOk()).toBe(true);
    expect(result.value).toEqual({
      dataSourceId: 1,
      sql: "select 1",
      format: "json",
    });
  });

  it("rejects empty SQL", () => {
    const result = validateQueryRunOptions({
      dataSourceId: "1",
      sql: "   ",
    });

    expect(result.isErr()).toBe(true);
  });

  it("accepts valid query explain options", () => {
    const result = validateQueryExplainOptions({
      dataSourceId: "1",
      sql: "select 1",
    });

    expect(result.isOk()).toBe(true);
    expect(result.value).toEqual({
      dataSourceId: 1,
      sql: "select 1",
    });
  });

  it("rejects invalid query explain data source id", () => {
    const result = validateQueryExplainOptions({
      dataSourceId: "0",
      sql: "select 1",
    });

    expect(result.isErr()).toBe(true);
  });
});
