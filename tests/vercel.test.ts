import express from "express";
import type { Express } from "express";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

let app: Express;

describe("Vercel function routing", () => {
  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "file::memory:";
    process.env.JWT_SECRET = "test-secret-value-that-is-long-enough-123456";
    const { default: vercelHandler } = await import("../api/index");
    app = express();
    app.all("/api/index", (req, res) => {
      void vercelHandler(req, res);
    });
  });

  it("restores rewritten route paths before dispatching to Express", async () => {
    const response = await request(app).get("/api/index?route=%2Fhealth");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
