import { describe, expect, it } from "vitest";
import { validateQueryRunOptions } from "../../src/cli/validation.js";

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
});
