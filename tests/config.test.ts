import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

const secret = "test-secret-value-that-is-long-enough-123456";

describe("environment configuration", () => {
  it("accepts local SQLite for development", () => {
    const config = loadConfig({
      NODE_ENV: "development",
      DATABASE_URL: "file:./data/test.db",
      JWT_SECRET: secret,
    });
    expect(config.databaseUrl).toBe("file:./data/test.db");
  });

  it("requires a persistent database for production", () => {
    expect(() => loadConfig({
      NODE_ENV: "production",
      DATABASE_URL: "file:./data/test.db",
      JWT_SECRET: secret,
    })).toThrow("Production deployments require a persistent hosted database URL");
  });

  it("requires an auth token for a remote libSQL database", () => {
    expect(() => loadConfig({
      NODE_ENV: "production",
      DATABASE_URL: "libsql://example.turso.io",
      JWT_SECRET: secret,
    })).toThrow("LIBSQL_AUTH_TOKEN is required");

    expect(loadConfig({
      NODE_ENV: "production",
      DATABASE_URL: "libsql://example.turso.io",
      LIBSQL_AUTH_TOKEN: "hosted-database-token",
      JWT_SECRET: secret,
    }).libsqlAuthToken).toBe("hosted-database-token");
  });
});

