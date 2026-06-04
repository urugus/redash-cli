import { describe, expect, it } from "vitest";
import { csvColumns, formatCsv, formatJson, parseOutputFormat } from "../../src/output/format.js";

describe("output format", () => {
  it("parses supported formats", () => {
    const defaultFormat = parseOutputFormat(undefined);
    const csvFormat = parseOutputFormat("csv");

    expect(defaultFormat.isOk()).toBe(true);
    expect(defaultFormat.value).toBe("json");
    expect(csvFormat.isOk()).toBe(true);
    expect(csvFormat.value).toBe("csv");
    expect(parseOutputFormat("yaml").isErr()).toBe(true);
  });

  it("formats JSON", () => {
    expect(formatJson([{ id: 1 }])).toBe('[\n  {\n    "id": 1\n  }\n]\n');
  });

  it("collects CSV columns in first-seen order", () => {
    expect(csvColumns([{ id: 1, name: "a" }, { count: 2 }])).toEqual(["id", "name", "count"]);
  });

  it("escapes CSV values", () => {
    expect(formatCsv([{ id: 1, name: "a,b", note: 'x"y' }])).toBe('id,name,note\n1,"a,b","x""y"\n');
  });
});
