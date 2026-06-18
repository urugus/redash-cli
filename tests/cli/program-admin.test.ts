import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Io } from "../../src/cli/program.js";

const redashMocks = vi.hoisted(() => {
  const client = {
    testAuth: vi.fn(),
    listDataSources: vi.fn(),
    getAdminQueueStatus: vi.fn(),
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
            admin: {
              url: "https://admin-redash.example.com",
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

describe("CLI program admin commands", () => {
  beforeEach(() => {
    process.exitCode = undefined;
    vi.clearAllMocks();
    redashMocks.createRedashClient.mockReturnValue(redashMocks.client);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it("prints admin queue status as JSON", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stdout, stderr } = createTestIo();

    redashMocks.client.getAdminQueueStatus.mockReturnValue(
      await okAsync({
        queues: {
          queries: {
            name: "queries",
            queued: 2,
            started: [{ id: "job-1" }],
          },
        },
        workers: [
          {
            name: "worker-1",
            state: "busy",
            current_job: "job-1",
            queues: "queries",
          },
        ],
      }),
    );

    await createProgram({ io }).parseAsync(["node", "redash", "admin", "queue-status"]);

    expect(stderr()).toBe("");
    expect(redashMocks.client.getAdminQueueStatus).toHaveBeenCalledWith();
    expect(JSON.parse(stdout())).toEqual({
      queues: {
        queries: {
          name: "queries",
          queued: 2,
          started: [{ id: "job-1" }],
        },
      },
      workers: [
        {
          name: "worker-1",
          state: "busy",
          current_job: "job-1",
          queues: "queries",
        },
      ],
    });
  });

  it("uses an explicit profile for admin queue status", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io } = createTestIo();

    redashMocks.client.getAdminQueueStatus.mockReturnValue(
      await okAsync({
        queues: {},
        workers: [],
      }),
    );

    await createProgram({ io }).parseAsync([
      "node",
      "redash",
      "admin",
      "queue-status",
      "--profile",
      "admin",
    ]);

    expect(redashMocks.createRedashClient).toHaveBeenCalledWith({
      baseUrl: "https://admin-redash.example.com",
      apiKey: "key",
    });
  });

  it("prints permission errors from Redash", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stderr } = createTestIo();

    redashMocks.client.getAdminQueueStatus.mockReturnValue(
      await errAsync(
        "Redash HTTP 403: /api/admin/queries/rq_status. The API key may not have permission for this operation.",
      ),
    );

    await createProgram({ io }).parseAsync(["node", "redash", "admin", "queue-status"]);

    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain("may not have permission");
  });
});
