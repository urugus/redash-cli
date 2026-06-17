import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Io } from "../../src/cli/program.js";

const redashMocks = vi.hoisted(() => {
  const client = {
    testAuth: vi.fn(),
    listDataSources: vi.fn(),
    listDashboards: vi.fn(),
    getDashboard: vi.fn(),
    inviteUser: vi.fn(),
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

const errAsync = async (message: string) => {
  const { ResultAsync } = await import("neverthrow");

  return ResultAsync.fromPromise(Promise.reject(new Error(message)), () => ({
    code: "redash_http_error" as const,
    message,
  }));
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

describe("CLI program dashboards", () => {
  beforeEach(() => {
    process.exitCode = undefined;
    vi.clearAllMocks();
    redashMocks.createRedashClient.mockReturnValue(redashMocks.client);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it("lists dashboards with defaults and prints JSON", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stdout, stderr } = createTestIo();

    redashMocks.client.listDashboards.mockReturnValue(
      await okAsync({
        count: 1,
        page: 1,
        page_size: 20,
        results: [
          {
            id: 10,
            name: "Sales Overview",
            slug: "sales-overview",
          },
        ],
      }),
    );

    await createProgram({ io }).parseAsync(["node", "redash", "dashboards", "list"]);

    expect(stderr()).toBe("");
    expect(redashMocks.client.listDashboards).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      order: "-created_at",
    });
    expect(JSON.parse(stdout())).toEqual({
      count: 1,
      page: 1,
      page_size: 20,
      results: [
        {
          id: 10,
          name: "Sales Overview",
          slug: "sales-overview",
        },
      ],
    });
  });

  it("lists dashboards with explicit paging and order", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io } = createTestIo();

    redashMocks.client.listDashboards.mockReturnValue(await okAsync({ results: [] }));

    await createProgram({ io }).parseAsync([
      "node",
      "redash",
      "dashboards",
      "list",
      "--page",
      "2",
      "--page-size",
      "50",
      "--order=-updated_at",
    ]);

    expect(redashMocks.client.listDashboards).toHaveBeenCalledWith({
      page: 2,
      pageSize: 50,
      order: "-updated_at",
    });
  });

  it("rejects invalid dashboard list options before calling Redash", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stderr } = createTestIo();

    await createProgram({ io }).parseAsync([
      "node",
      "redash",
      "dashboards",
      "list",
      "--page-size",
      "251",
    ]);

    expect(redashMocks.client.listDashboards).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain("Page size must be less than or equal to 250.");
  });

  it("prints dashboard list Redash errors", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stderr } = createTestIo();

    redashMocks.client.listDashboards.mockReturnValue(
      await errAsync("Redash HTTP 403: /api/dashboards. The API key may not have permission."),
    );

    await createProgram({ io }).parseAsync(["node", "redash", "dashboards", "list"]);

    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain("may not have permission");
  });

  it("gets a dashboard by slug and prints JSON", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stdout, stderr } = createTestIo();

    redashMocks.client.getDashboard.mockReturnValue(
      await okAsync({
        id: 10,
        name: "Sales Overview",
        slug: "sales-overview",
        widgets: [],
      }),
    );

    await createProgram({ io }).parseAsync([
      "node",
      "redash",
      "dashboards",
      "get",
      "sales-overview",
    ]);

    expect(stderr()).toBe("");
    expect(redashMocks.client.getDashboard).toHaveBeenCalledWith("sales-overview");
    expect(JSON.parse(stdout())).toEqual({
      id: 10,
      name: "Sales Overview",
      slug: "sales-overview",
      widgets: [],
    });
  });

  it("prints dashboard get Redash errors", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stderr } = createTestIo();

    redashMocks.client.getDashboard.mockReturnValue(
      await errAsync("Redash HTTP 404: /api/dashboards/missing"),
    );

    await createProgram({ io }).parseAsync(["node", "redash", "dashboards", "get", "missing"]);

    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain("Redash HTTP 404");
  });
});
