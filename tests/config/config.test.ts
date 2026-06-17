import { describe, expect, it } from "vitest";
import {
  emptyConfig,
  normalizeRedashUrl,
  parseConfigText,
  resolveProfile,
  serializeConfig,
  setDefaultProfile,
  upsertProfile,
} from "../../src/config/config.js";

describe("config", () => {
  it("normalizes Redash URL by removing the trailing slash", () => {
    const result = normalizeRedashUrl("https://redash.example.com/");

    expect(result.isOk()).toBe(true);
    expect(result.value).toBe("https://redash.example.com");
  });

  it("rejects non-http URLs", () => {
    const result = normalizeRedashUrl("file:///tmp/redash");

    expect(result.isErr()).toBe(true);
  });

  it("parses and serializes config without API keys", () => {
    const config = upsertProfile(emptyConfig(), "ey", "https://redash.example.com");
    const parsed = parseConfigText(serializeConfig(config));

    expect(parsed.isOk()).toBe(true);
    expect(parsed.value).toEqual({
      defaultProfile: "ey",
      profiles: {
        ey: {
          url: "https://redash.example.com",
        },
      },
    });
  });

  it("rejects invalid config JSON", () => {
    const result = parseConfigText("{");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("config_invalid");
      expect(result.error.message).toBe("Config file is not valid JSON.");
    }
  });

  it("resolves the default profile", () => {
    const config = upsertProfile(emptyConfig(), "ey", "https://redash.example.com");
    const result = resolveProfile(config);

    expect(result.isOk()).toBe(true);
    expect(result.value).toEqual({
      name: "ey",
      url: "https://redash.example.com",
    });
  });

  it("changes the default profile", () => {
    const config = upsertProfile(
      upsertProfile(emptyConfig(), "ey", "https://redash.example.com"),
      "local",
      "http://localhost:5000",
    );
    const result = setDefaultProfile(config, "local");

    expect(result.isOk()).toBe(true);
    expect(result.value.defaultProfile).toBe("local");
  });

  it("rejects missing profiles", () => {
    const result = resolveProfile(emptyConfig(), "missing");

    expect(result.isErr()).toBe(true);
  });
});
