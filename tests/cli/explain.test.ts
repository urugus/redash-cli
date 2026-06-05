import type { Result } from "neverthrow";
import { describe, expect, it } from "vitest";
import {
  buildPostgresExplainSql,
  decodePostgresExplainRows,
  findPostgresDataSource,
} from "../../src/cli/explain.js";

const expectOkValue = <T, E>(result: Result<T, E>): T => {
  if (result.isErr()) {
    throw new Error("result should be ok");
  }

  return result.value;
};

describe("query explain helpers", () => {
  it("builds PostgreSQL EXPLAIN SQL for SELECT and WITH queries", () => {
    expect(expectOkValue(buildPostgresExplainSql("select 1"))).toBe(
      "EXPLAIN (FORMAT JSON)\nselect 1",
    );
    expect(expectOkValue(buildPostgresExplainSql("select 1;"))).toBe(
      "EXPLAIN (FORMAT JSON)\nselect 1",
    );
    expect(expectOkValue(buildPostgresExplainSql("with x as (select 1) select * from x;"))).toBe(
      "EXPLAIN (FORMAT JSON)\nwith x as (select 1) select * from x",
    );
  });

  it("ignores semicolons inside SQL literals and comments", () => {
    expect(expectOkValue(buildPostgresExplainSql("select 'a;b' as value"))).toBe(
      "EXPLAIN (FORMAT JSON)\nselect 'a;b' as value",
    );
    expect(expectOkValue(buildPostgresExplainSql('select "semi;colon" from t'))).toBe(
      'EXPLAIN (FORMAT JSON)\nselect "semi;colon" from t',
    );
    expect(expectOkValue(buildPostgresExplainSql("select $$a;b$$ as value"))).toBe(
      "EXPLAIN (FORMAT JSON)\nselect $$a;b$$ as value",
    );
    expect(expectOkValue(buildPostgresExplainSql("select E'a\\';b' as value"))).toBe(
      "EXPLAIN (FORMAT JSON)\nselect E'a\\';b' as value",
    );
    expect(expectOkValue(buildPostgresExplainSql("select 1 -- ignored ;\n"))).toBe(
      "EXPLAIN (FORMAT JSON)\nselect 1 -- ignored ;",
    );
    expect(expectOkValue(buildPostgresExplainSql("select /* ignored ; */ 1"))).toBe(
      "EXPLAIN (FORMAT JSON)\nselect /* ignored ; */ 1",
    );
  });

  it("accepts leading comments and parenthesized SELECT queries", () => {
    expect(expectOkValue(buildPostgresExplainSql("/* comment */ select 1"))).toBe(
      "EXPLAIN (FORMAT JSON)\n/* comment */ select 1",
    );
    expect(expectOkValue(buildPostgresExplainSql("-- comment\nselect 1"))).toBe(
      "EXPLAIN (FORMAT JSON)\n-- comment\nselect 1",
    );
    expect(expectOkValue(buildPostgresExplainSql("(select 1) union (select 2)"))).toBe(
      "EXPLAIN (FORMAT JSON)\n(select 1) union (select 2)",
    );
  });

  it("rejects empty, non-read, and multi-statement SQL", () => {
    expect(buildPostgresExplainSql("   ").isErr()).toBe(true);
    expect(buildPostgresExplainSql("insert into users values (1)").isErr()).toBe(true);
    expect(buildPostgresExplainSql("update users set name = 'a'").isErr()).toBe(true);
    expect(buildPostgresExplainSql("delete from users").isErr()).toBe(true);
    expect(buildPostgresExplainSql("drop table users").isErr()).toBe(true);
    expect(buildPostgresExplainSql("select 1; select 2").isErr()).toBe(true);
    expect(buildPostgresExplainSql("select 'a\\'; select 2").isErr()).toBe(true);
  });

  it("accepts PostgreSQL data source types only", () => {
    const result = findPostgresDataSource(
      [
        { id: 1, name: "main", type: "pg" },
        { id: 2, name: "warehouse", type: "bigquery" },
      ],
      1,
    );

    expect(result.isOk()).toBe(true);
    expect(
      findPostgresDataSource([{ id: 2, name: "warehouse", type: "bigquery" }], 2).isErr(),
    ).toBe(true);
    expect(findPostgresDataSource([], 1).isErr()).toBe(true);
  });

  it("accepts PostgreSQL data source aliases case-insensitively", () => {
    expect(findPostgresDataSource([{ id: 1, name: "main", type: "postgres" }], 1).isOk()).toBe(
      true,
    );
    expect(findPostgresDataSource([{ id: 1, name: "main", type: "PostgreSQL" }], 1).isOk()).toBe(
      true,
    );
  });

  it("decodes PostgreSQL EXPLAIN rows from object values", () => {
    const plan = [
      {
        Plan: {
          "Node Type": "Seq Scan",
          "Plan Rows": 123,
          "Total Cost": 45.6,
        },
      },
    ];

    const result = decodePostgresExplainRows([{ "QUERY PLAN": plan }]);

    expect(result.isOk()).toBe(true);
    expect(result.value).toEqual({
      summary: {
        nodeType: "Seq Scan",
        planRows: 123,
        totalCost: 45.6,
      },
      plan,
    });
  });

  it("decodes PostgreSQL EXPLAIN rows from JSON strings", () => {
    const result = decodePostgresExplainRows([
      {
        "QUERY PLAN": JSON.stringify([
          {
            Plan: {
              "Node Type": "Result",
              "Plan Rows": 1,
              "Total Cost": 0.01,
            },
          },
        ]),
      },
    ]);

    expect(result.isOk()).toBe(true);
    expect(result.value.summary).toEqual({
      nodeType: "Result",
      planRows: 1,
      totalCost: 0.01,
    });
  });

  it("rejects invalid EXPLAIN rows", () => {
    expect(decodePostgresExplainRows([]).isErr()).toBe(true);
    expect(decodePostgresExplainRows([{ "QUERY PLAN": "not-json" }]).isErr()).toBe(true);
    expect(decodePostgresExplainRows([{ "QUERY PLAN": [{ nope: true }] }]).isErr()).toBe(true);
  });
});
