import { describe, expect, it } from "vitest";
import {
  emptyConfig,
  normalizeRedashUrl,
  parseConfigJson,
  parseConfigText,
  resolveProfile,
  serializeConfig,
  setDefaultProfile,
  upsertProfile,
  validateProfileName,
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

  it("rejects empty and malformed Redash URLs", () => {
    expect(normalizeRedashUrl("   ").isErr()).toBe(true);
    expect(normalizeRedashUrl("not a url").isErr()).toBe(true);
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

  it("rejects invalid config shapes", () => {
    expect(parseConfigJson(null).isErr()).toBe(true);
    expect(parseConfigJson({ profiles: { default: { url: "" } } }).isErr()).toBe(true);
    expect(parseConfigJson({ profiles: {}, extra: true }).isErr()).toBe(true);
  });

  it("validates profile names", () => {
    const result = validateProfileName(" default ");

    expect(result.isOk()).toBe(true);
    expect(result.value).toBe("default");
    expect(validateProfileName("   ").isErr()).toBe(true);
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

  it("preserves an existing default profile when adding profiles", () => {
    const config = upsertProfile(
      upsertProfile(emptyConfig(), "default", "https://redash.example.com"),
      "local",
      "http://localhost:5000",
    );

    expect(config.defaultProfile).toBe("default");
  });

  it("rejects setting a missing default profile", () => {
    const result = setDefaultProfile(emptyConfig(), "missing");

    expect(result.isErr()).toBe(true);
  });

  it("rejects missing profiles", () => {
    const result = resolveProfile(emptyConfig(), "missing");

    expect(result.isErr()).toBe(true);
  });

  it("rejects missing default profile when no explicit profile is provided", () => {
    const result = resolveProfile(emptyConfig());

    expect(result.isErr()).toBe(true);
  });
});
