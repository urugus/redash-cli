import { describe, expect, it, vi } from "vitest";
import { createRedashClient, type FetchLike } from "../../src/redash/client.js";

const jsonResponse = (json: unknown, status = 200): Response =>
  new Response(JSON.stringify(json), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

describe("Redash client", () => {
  it("lists data sources", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse([
        {
          id: 1,
          name: "main",
          type: "pg",
        },
      ]),
    );
    const client = createRedashClient({
      baseUrl: "https://redash.example.com",
      apiKey: "key",
      fetchImpl,
    });

    const result = await client.listDataSources();

    expect(result.isOk()).toBe(true);
    expect(result.value).toEqual([{ id: 1, name: "main", type: "pg" }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://redash.example.com/api/data_sources",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Key key",
        }),
      }),
    );
  });

  it("invites a user and sends an email by default", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        id: 10,
        name: "Taro Yamada",
        email: "taro@example.com",
        is_invitation_pending: true,
      }),
    );
    const client = createRedashClient({
      baseUrl: "https://redash.example.com",
      apiKey: "key",
      fetchImpl,
    });

    const result = await client.inviteUser({
      name: "Taro Yamada",
      email: "taro@example.com",
      sendEmail: true,
    });

    expect(result.isOk()).toBe(true);
    expect(result.value).toEqual({
      id: 10,
      name: "Taro Yamada",
      email: "taro@example.com",
      is_invitation_pending: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://redash.example.com/api/users",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Taro Yamada",
          email: "taro@example.com",
        }),
      }),
    );
  });

  it("invites a user without sending an email", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        id: 10,
        name: "Taro Yamada",
        email: "taro@example.com",
        invite_link: "https://redash.example.com/invite/token",
      }),
    );
    const client = createRedashClient({
      baseUrl: "https://redash.example.com",
      apiKey: "key",
      fetchImpl,
    });

    const result = await client.inviteUser({
      name: "Taro Yamada",
      email: "taro@example.com",
      sendEmail: false,
    });

    expect(result.isOk()).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://redash.example.com/api/users?no_invite",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("returns a permission error when user invitation is forbidden", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ message: "no" }, 403));
    const client = createRedashClient({
      baseUrl: "https://redash.example.com",
      apiKey: "key",
      fetchImpl,
    });

    const result = await client.inviteUser({
      name: "Taro Yamada",
      email: "taro@example.com",
      sendEmail: true,
    });

    expect(result.isErr()).toBe(true);
    expect(result.error.message).toContain("may not have permission");
  });

  it("returns immediate query rows", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        query_result: {
          data: {
            rows: [{ id: 1 }],
          },
        },
      }),
    );
    const client = createRedashClient({
      baseUrl: "https://redash.example.com",
      apiKey: "key",
      fetchImpl,
    });

    const result = await client.runQuery(1, "select 1");

    expect(result.isOk()).toBe(true);
    expect(result.value).toEqual([{ id: 1 }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://redash.example.com/api/query_results",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          data_source_id: 1,
          query: "select 1",
          max_age: 0,
        }),
      }),
    );
  });

  it("polls query jobs and fetches rows", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        jsonResponse({
          job: {
            id: "job-1",
            status: 1,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          job: {
            id: "job-1",
            status: 3,
            query_result_id: 10,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          query_result: {
            data: {
              rows: [{ count: 1 }],
            },
          },
        }),
      );
    const client = createRedashClient({
      baseUrl: "https://redash.example.com",
      apiKey: "key",
      fetchImpl,
      sleep: () => Promise.resolve(),
    });

    const result = await client.runQuery(1, "select count(*)");

    expect(result.isOk()).toBe(true);
    expect(result.value).toEqual([{ count: 1 }]);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://redash.example.com/api/jobs/job-1",
      expect.anything(),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "https://redash.example.com/api/query_results/10",
      expect.anything(),
    );
  });

  it("returns an error when the job fails", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        jsonResponse({
          job: {
            id: "job-1",
            status: 1,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          job: {
            id: "job-1",
            status: 4,
            error: "syntax error",
          },
        }),
      );
    const client = createRedashClient({
      baseUrl: "https://redash.example.com",
      apiKey: "key",
      fetchImpl,
      sleep: () => Promise.resolve(),
    });

    const result = await client.runQuery(1, "bad sql");

    expect(result.isErr()).toBe(true);
  });

  it("returns an error for HTTP failures", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ message: "no" }, 401));
    const client = createRedashClient({
      baseUrl: "https://redash.example.com",
      apiKey: "key",
      fetchImpl,
    });

    const result = await client.testAuth();

    expect(result.isErr()).toBe(true);
  });
});
