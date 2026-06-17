import { describe, expect, it } from "vitest";
import {
  validateDashboardGetOptions,
  validateDashboardListOptions,
  validateQueryExplainOptions,
  validateQueryRunOptions,
  validateUserInviteOptions,
} from "../../src/cli/validation.js";

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

  it("accepts valid user invite options", () => {
    const result = validateUserInviteOptions({
      name: " Taro Yamada ",
      email: " taro@example.com ",
      sendEmail: false,
    });

    expect(result.isOk()).toBe(true);
    expect(result.value).toEqual({
      name: "Taro Yamada",
      email: "taro@example.com",
      sendEmail: false,
    });
  });

  it("rejects invalid user invite email", () => {
    const result = validateUserInviteOptions({
      name: "Taro Yamada",
      email: "taro.example.com",
    });

    expect(result.isErr()).toBe(true);
  });

  it("accepts dashboard list defaults", () => {
    const result = validateDashboardListOptions({});

    expect(result.isOk()).toBe(true);
    expect(result.value).toEqual({
      page: 1,
      pageSize: 20,
      order: "-created_at",
    });
  });

  it("rejects invalid dashboard page options", () => {
    expect(validateDashboardListOptions({ page: "0" }).isErr()).toBe(true);
    expect(validateDashboardListOptions({ pageSize: "0" }).isErr()).toBe(true);
    expect(validateDashboardListOptions({ pageSize: "251" }).isErr()).toBe(true);
    expect(validateDashboardListOptions({ page: "1e2" }).isErr()).toBe(true);
  });

  it("rejects empty dashboard order", () => {
    const result = validateDashboardListOptions({
      order: "   ",
    });

    expect(result.isErr()).toBe(true);
  });

  it("accepts and trims dashboard slugs", () => {
    const result = validateDashboardGetOptions(" sales-overview ", {});

    expect(result.isOk()).toBe(true);
    expect(result.value).toEqual({
      slug: "sales-overview",
    });
  });
});
