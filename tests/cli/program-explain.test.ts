import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Io } from "../../src/cli/program.js";

const redashMocks = vi.hoisted(() => {
  const client = {
    testAuth: vi.fn(),
    listDataSources: vi.fn(),
    runQuery: vi.fn(),
  };

  return {
    client,
    createRedashClient: vi.fn(() => client),
  };
});

vi.mock("../../src/config/config-store.js", async () => {
  const { ResultAsync } = await import("neverthrow");

  return {
    readConfigFile: vi.fn(() =>
      ResultAsync.fromSafePromise(
        Promise.resolve({
          defaultProfile: "default",
          profiles: {
            default: {
              url: "https://redash.example.com",
            },
          },
        }),
      ),
    ),
    writeConfigFile: vi.fn(),
  };
});

vi.mock("../../src/keychain/keychain.js", async () => {
  const { ResultAsync } = await import("neverthrow");

  return {
    readApiKey: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve("key"))),
    saveApiKey: vi.fn(),
  };
});

vi.mock("../../src/redash/client.js", () => ({
  createRedashClient: redashMocks.createRedashClient,
}));

const okAsync = async <T>(value: T) => {
  const { ResultAsync } = await import("neverthrow");

  return ResultAsync.fromSafePromise(Promise.resolve(value));
};

const createTestIo = (): {
  readonly io: Io;
  readonly stdout: () => string;
  readonly stderr: () => string;
} => {
  let stdout = "";
  let stderr = "";

  return {
    io: {
      stdout: {
        write: (chunk: string) => {
          stdout += chunk;
          return true;
        },
      },
      stderr: {
        write: (chunk: string) => {
          stderr += chunk;
          return true;
        },
      },
    },
    stdout: () => stdout,
    stderr: () => stderr,
  };
};

describe("CLI program query explain", () => {
  beforeEach(() => {
    process.exitCode = undefined;
    vi.clearAllMocks();
    redashMocks.createRedashClient.mockReturnValue(redashMocks.client);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it("runs PostgreSQL EXPLAIN and prints summary plus plan JSON", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stdout, stderr } = createTestIo();
    const plan = [
      {
        Plan: {
          "Node Type": "Result",
          "Plan Rows": 1,
          "Total Cost": 0.01,
        },
      },
    ];

    redashMocks.client.listDataSources.mockReturnValue(
      await okAsync([{ id: 1, name: "main", type: "pg" }]),
    );
    redashMocks.client.runQuery.mockReturnValue(await okAsync([{ "QUERY PLAN": plan }]));

    await createProgram({ io }).parseAsync([
      "node",
      "redash",
      "query",
      "explain",
      "--data-source-id",
      "1",
      "--sql",
      "select 1;",
    ]);

    expect(stderr()).toBe("");
    expect(redashMocks.client.runQuery).toHaveBeenCalledWith(1, "EXPLAIN (FORMAT JSON)\nselect 1");
    expect(JSON.parse(stdout())).toEqual({
      summary: {
        nodeType: "Result",
        planRows: 1,
        totalCost: 0.01,
      },
      plan,
    });
  });

  it("rejects non-PostgreSQL data sources without running the query", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stderr } = createTestIo();

    redashMocks.client.listDataSources.mockReturnValue(
      await okAsync([{ id: 1, name: "warehouse", type: "bigquery" }]),
    );

    await createProgram({ io }).parseAsync([
      "node",
      "redash",
      "query",
      "explain",
      "--data-source-id",
      "1",
      "--sql",
      "select 1",
    ]);

    expect(redashMocks.client.runQuery).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain("This command currently supports PostgreSQL data sources only.");
  });

  it("rejects invalid SQL before fetching data sources", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stderr } = createTestIo();

    await createProgram({ io }).parseAsync([
      "node",
      "redash",
      "query",
      "explain",
      "--data-source-id",
      "1",
      "--sql",
      "select 1; select 2",
    ]);

    expect(redashMocks.client.listDataSources).not.toHaveBeenCalled();
    expect(redashMocks.client.runQuery).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain("EXPLAIN only supports a single SQL statement.");
  });
});
