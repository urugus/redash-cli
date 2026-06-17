import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Io } from "../../src/cli/program.js";

const configStoreMocks = vi.hoisted(() => ({
  readConfigFile: vi.fn(),
  writeConfigFile: vi.fn(),
}));

const keychainMocks = vi.hoisted(() => ({
  readApiKey: vi.fn(),
  saveApiKey: vi.fn(),
}));

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

vi.mock("../../src/config/config-store.js", () => configStoreMocks);
vi.mock("../../src/keychain/keychain.js", () => keychainMocks);
vi.mock("../../src/redash/client.js", () => ({
  createRedashClient: redashMocks.createRedashClient,
}));

const okAsync = async <T>(value: T) => {
  const { ResultAsync } = await import("neverthrow");

  return ResultAsync.fromSafePromise(Promise.resolve(value));
};

const errAsync = async (message: string, code = "redash_http_error" as const) => {
  const { ResultAsync } = await import("neverthrow");

  return ResultAsync.fromPromise(Promise.reject(new Error(message)), () => ({
    code,
    message,
  }));
};

const storedConfig = {
  defaultProfile: "default",
  profiles: {
    default: {
      url: "https://redash.example.com",
    },
    local: {
      url: "http://localhost:5000",
    },
  },
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

describe("CLI program core commands", () => {
  beforeEach(async () => {
    process.exitCode = undefined;
    vi.clearAllMocks();
    configStoreMocks.readConfigFile.mockReturnValue(await okAsync(storedConfig));
    configStoreMocks.writeConfigFile.mockReturnValue(await okAsync(undefined));
    keychainMocks.readApiKey.mockReturnValue(await okAsync("key"));
    keychainMocks.saveApiKey.mockReturnValue(await okAsync(undefined));
    redashMocks.createRedashClient.mockReturnValue(redashMocks.client);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it("sets a profile, prompts for an API key, and saves both", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stdout, stderr } = createTestIo();
    const promptPassword = vi.fn().mockResolvedValue("new-key");

    await createProgram({ io, promptPassword }).parseAsync([
      "node",
      "redash",
      "config",
      "set",
      "--profile",
      "new",
      "--url",
      "https://new-redash.example.com/",
    ]);

    expect(stderr()).toBe("");
    expect(configStoreMocks.writeConfigFile).toHaveBeenCalledWith({
      defaultProfile: "default",
      profiles: {
        ...storedConfig.profiles,
        new: {
          url: "https://new-redash.example.com",
        },
      },
    });
    expect(promptPassword).toHaveBeenCalledWith("Redash API key");
    expect(keychainMocks.saveApiKey).toHaveBeenCalledWith("new", "new-key");
    expect(stdout()).toBe("Saved profile: new\n");
  });

  it("prints prompt failures when setting a profile", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stderr } = createTestIo();
    const promptPassword = vi.fn().mockRejectedValue(new Error("cancelled"));

    await createProgram({ io, promptPassword }).parseAsync([
      "node",
      "redash",
      "config",
      "set",
      "--profile",
      "new",
      "--url",
      "https://redash.example.com",
    ]);

    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain("Failed to read API key input.");
  });

  it("rejects invalid profile settings before writing", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stderr } = createTestIo();

    await createProgram({ io }).parseAsync([
      "node",
      "redash",
      "config",
      "set",
      "--profile",
      " ",
      "--url",
      "ftp://redash.example.com",
    ]);

    expect(configStoreMocks.writeConfigFile).not.toHaveBeenCalled();
    expect(keychainMocks.saveApiKey).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain("Profile name is required.");
  });

  it("lists profiles and marks the default", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stdout, stderr } = createTestIo();

    await createProgram({ io }).parseAsync(["node", "redash", "config", "list"]);

    expect(stderr()).toBe("");
    expect(stdout()).toBe(
      "* default\thttps://redash.example.com\n  local\thttp://localhost:5000\n",
    );
  });

  it("prints nothing when there are no profiles to list", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stdout } = createTestIo();

    configStoreMocks.readConfigFile.mockReturnValue(await okAsync({ profiles: {} }));

    await createProgram({ io }).parseAsync(["node", "redash", "config", "list"]);

    expect(stdout()).toBe("");
  });

  it("sets the default profile", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stdout, stderr } = createTestIo();

    await createProgram({ io }).parseAsync(["node", "redash", "config", "use", "local"]);

    expect(stderr()).toBe("");
    expect(configStoreMocks.writeConfigFile).toHaveBeenCalledWith({
      ...storedConfig,
      defaultProfile: "local",
    });
    expect(stdout()).toBe("Using profile: local\n");
  });

  it("rejects unknown default profiles", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stderr } = createTestIo();

    await createProgram({ io }).parseAsync(["node", "redash", "config", "use", "missing"]);

    expect(configStoreMocks.writeConfigFile).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain("Profile not found: missing");
  });

  it("tests authentication using an explicit profile", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stdout, stderr } = createTestIo();

    redashMocks.client.testAuth.mockReturnValue(await okAsync(undefined));

    await createProgram({ io }).parseAsync([
      "node",
      "redash",
      "auth",
      "test",
      "--profile",
      "local",
    ]);

    expect(stderr()).toBe("");
    expect(redashMocks.createRedashClient).toHaveBeenCalledWith({
      baseUrl: "http://localhost:5000",
      apiKey: "key",
    });
    expect(stdout()).toBe("Authenticated: local\n");
  });

  it("prints authentication errors", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stderr } = createTestIo();

    redashMocks.client.testAuth.mockReturnValue(await errAsync("Redash HTTP 401: /api/session"));

    await createProgram({ io }).parseAsync(["node", "redash", "auth", "test"]);

    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain("Redash HTTP 401");
  });

  it("lists data sources as JSON", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stdout, stderr } = createTestIo();

    redashMocks.client.listDataSources.mockReturnValue(
      await okAsync([{ id: 1, name: "main", type: "pg" }]),
    );

    await createProgram({ io }).parseAsync(["node", "redash", "data-sources", "list"]);

    expect(stderr()).toBe("");
    expect(JSON.parse(stdout())).toEqual([{ id: 1, name: "main", type: "pg" }]);
  });

  it("runs a query and prints JSON rows by default", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stdout, stderr } = createTestIo();

    redashMocks.client.runQuery.mockReturnValue(await okAsync([{ id: 1 }]));

    await createProgram({ io }).parseAsync([
      "node",
      "redash",
      "query",
      "run",
      "--data-source-id",
      "1",
      "--sql",
      "select 1",
    ]);

    expect(stderr()).toBe("");
    expect(redashMocks.client.runQuery).toHaveBeenCalledWith(1, "select 1");
    expect(JSON.parse(stdout())).toEqual([{ id: 1 }]);
  });

  it("runs a query and prints CSV rows", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stdout } = createTestIo();

    redashMocks.client.runQuery.mockReturnValue(await okAsync([{ id: 1, name: "a" }]));

    await createProgram({ io }).parseAsync([
      "node",
      "redash",
      "query",
      "run",
      "--data-source-id",
      "1",
      "--sql",
      "select 1",
      "--format",
      "csv",
    ]);

    expect(stdout()).toBe("id,name\n1,a\n");
  });

  it("rejects unsupported query output formats before calling Redash", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stderr } = createTestIo();

    await createProgram({ io }).parseAsync([
      "node",
      "redash",
      "query",
      "run",
      "--data-source-id",
      "1",
      "--sql",
      "select 1",
      "--format",
      "yaml",
    ]);

    expect(redashMocks.client.runQuery).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain("Unsupported output format: yaml");
  });

  it("prints config errors before building a client", async () => {
    const { createProgram } = await import("../../src/cli/program.js");
    const { io, stderr } = createTestIo();

    configStoreMocks.readConfigFile.mockReturnValue(
      await errAsync("Failed to read config", "config_invalid"),
    );

    await createProgram({ io }).parseAsync(["node", "redash", "data-sources", "list"]);

    expect(redashMocks.createRedashClient).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain("Failed to read config");
  });
});
