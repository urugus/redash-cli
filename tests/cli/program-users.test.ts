import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Io } from "../../src/cli/program.js";

const redashMocks = vi.hoisted(() => {
  const client = {
    testAuth: vi.fn(),
    listDataSources: vi.fn(),
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

const errAsync = async () => {
  const { ResultAsync } = await import("neverthrow");

  return ResultAsync.fromPromise(Promise.reject(new Error("forbidden")), () => ({
    code: "redash_http_error" as const,
    message: "Redash HTTP 403: /api/users. The API key may not have permission for this operation.",
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

describe("CLI program users", () => {
  beforeEach(() => {
    process.exitCode = undefined;
    vi.clearAllMocks();
    redashMocks.createRedashClient.mockReturnValue(redashMocks.client);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it("invites a user and prints the Redash response", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stdout, stderr } = createTestIo();

    redashMocks.client.inviteUser.mockReturnValue(
      await okAsync({
        id: 10,
        name: "Taro Yamada",
        email: "taro@example.com",
        is_invitation_pending: true,
      }),
    );

    await createProgram({ io }).parseAsync([
      "node",
      "redash",
      "users",
      "invite",
      "--name",
      "Taro Yamada",
      "--email",
      "taro@example.com",
    ]);

    expect(stderr()).toBe("");
    expect(redashMocks.client.inviteUser).toHaveBeenCalledWith({
      name: "Taro Yamada",
      email: "taro@example.com",
      sendEmail: true,
    });
    expect(JSON.parse(stdout())).toEqual({
      id: 10,
      name: "Taro Yamada",
      email: "taro@example.com",
      is_invitation_pending: true,
    });
  });

  it("can create an invite without sending email", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io } = createTestIo();

    redashMocks.client.inviteUser.mockReturnValue(
      await okAsync({
        id: 10,
        name: "Taro Yamada",
        email: "taro@example.com",
        invite_link: "https://redash.example.com/invite/token",
      }),
    );

    await createProgram({ io }).parseAsync([
      "node",
      "redash",
      "users",
      "invite",
      "--name",
      "Taro Yamada",
      "--email",
      "taro@example.com",
      "--no-send-email",
    ]);

    expect(redashMocks.client.inviteUser).toHaveBeenCalledWith({
      name: "Taro Yamada",
      email: "taro@example.com",
      sendEmail: false,
    });
  });

  it("prints permission errors from Redash", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stderr } = createTestIo();

    redashMocks.client.inviteUser.mockReturnValue(await errAsync());

    await createProgram({ io }).parseAsync([
      "node",
      "redash",
      "users",
      "invite",
      "--name",
      "Taro Yamada",
      "--email",
      "taro@example.com",
    ]);

    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain("may not have permission");
  });
});
