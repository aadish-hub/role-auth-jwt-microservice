import bcrypt from "bcryptjs";
import { createLibsqlUserRepository } from "../src/libsql-users";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { AppConfig } from "../src/config";
import type { UserRecord, UserRepository, UserRole } from "../src/users";

const secret = "test-secret-value-that-is-long-enough-123456";
const config: AppConfig = {
  nodeEnv: "test",
  port: 3000,
  databaseUrl: "postgresql://postgres:postgres@localhost:5432/role_auth",
  jwtSecret: secret,
  jwtExpiresIn: "15m",
  bcryptRounds: 10,
};

class InMemoryUsers implements UserRepository {
  private readonly records = new Map<string, UserRecord>();

  async findByEmail(email: string) {
    return [...this.records.values()].find((user) => user.email === email) ?? null;
  }

  async findById(id: string) {
    return this.records.get(id) ?? null;
  }

  async create(input: { email: string; passwordHash: string; role: UserRole }) {
    if (await this.findByEmail(input.email)) {
      throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
    }
    const user: UserRecord = {
      id: crypto.randomUUID(),
      ...input,
      createdAt: new Date(),
    };
    this.records.set(user.id, user);
    return user;
  }

  async createInitialAdmin(input: { email: string; passwordHash: string }) {
    const existing = await this.findByEmail(input.email);
    if (existing) return existing;
    return this.create({ ...input, role: "ADMIN" });
  }
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("authentication API", () => {
  it("serves the browser app and its static assets", async () => {
    const app = createApp(config, new InMemoryUsers());
    const page = await request(app).get("/");
    const stylesheet = await request(app).get("/styles.css");
    const script = await request(app).get("/app.js");

    expect(page.status).toBe(200);
    expect(page.text).toContain("Create account");
    expect(page.text).toContain("YOUR WORKSPACE");
    expect(stylesheet.status).toBe(200);
    expect(stylesheet.text).toContain(".story-panel");
    expect(script.status).toBe(200);
    expect(script.text).toContain("/auth/register");
  });

  it("registers a USER and never exposes the password hash", async () => {
    const app = createApp(config, new InMemoryUsers());
    const response = await request(app)
      .post("/auth/register")
      .send({ email: "Alice@Example.com", password: "correct-horse-battery" });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      email: "alice@example.com",
      role: "USER",
    });
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.token).toEqual(expect.any(String));
    expect(jwt.verify(response.body.token, secret)).toMatchObject({
      email: "alice@example.com",
      role: "USER",
    });
  });

  it("rejects short passwords and duplicate registrations", async () => {
    const app = createApp(config, new InMemoryUsers());
    const shortPassword = await request(app)
      .post("/auth/register")
      .send({ email: "alice@example.com", password: "short" });
    expect(shortPassword.status).toBe(400);

    const payload = { email: "alice@example.com", password: "correct-horse-battery" };
    expect((await request(app).post("/auth/register").send({
      ...payload,
      role: "ADMIN",
    })).status).toBe(400);
    expect((await request(app).post("/auth/register").send({
      email: "alice@example.com",
      password: "😀".repeat(19),
    })).status).toBe(400);
    expect((await request(app).post("/auth/register").send(payload)).status).toBe(201);
    expect((await request(app).post("/auth/register").send(payload)).status).toBe(409);
  });

  it("reports malformed JSON as a client error", async () => {
    const app = createApp(config, new InMemoryUsers());
    const response = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send("{");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid JSON request body");
  });

  it("reports unavailable database connections as service unavailable", async () => {
    const users = new InMemoryUsers();
    users.findByEmail = async () => {
      throw Object.assign(new Error("Connection refused"), { code: "ECONNREFUSED" });
    };
    const app = createApp(config, users);
    const response = await request(app)
      .post("/auth/login")
      .send({ email: "alice@example.com", password: "correct-horse-battery" });

    expect(response.status).toBe(503);
    expect(response.body.error).toContain("authentication database is unavailable");
    expect(response.body.error).not.toContain("ECONNREFUSED");
  });

  it("authenticates login and returns the same generic error for bad credentials", async () => {
    const users = new InMemoryUsers();
    const app = createApp(config, users);
    await request(app)
      .post("/auth/register")
      .send({ email: "alice@example.com", password: "correct-horse-battery" });

    const login = await request(app)
      .post("/auth/login")
      .send({ email: "ALICE@example.com", password: "correct-horse-battery" });
    expect(login.status).toBe(200);
    expect((await request(app).get("/auth/me").set(bearer(login.body.token))).status).toBe(200);

    const wrongPassword = await request(app)
      .post("/auth/login")
      .send({ email: "alice@example.com", password: "wrong-password" });
    const unknownEmail = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: "wrong-password" });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it("supports registration and login with the embedded SQLite repository", async () => {
    const database = await createLibsqlUserRepository("file::memory:");
    try {
      const app = createApp(config, database.users);
      const registration = await request(app)
        .post("/auth/register")
        .send({ email: "saved@example.com", password: "correct-horse-battery" });
      expect(registration.status).toBe(201);
      expect(registration.body.user.role).toBe("USER");
      expect((await request(app)
        .post("/auth/register")
        .send({ email: "saved@example.com", password: "correct-horse-battery" })).status).toBe(409);
      const login = await request(app)
        .post("/auth/login")
        .send({ email: "saved@example.com", password: "correct-horse-battery" });
      expect(login.status).toBe(200);
      expect(login.body.user.email).toBe("saved@example.com");
    } finally {
      await database.close();
    }
  });

  it("rejects invalid tokens and enforces ADMIN access", async () => {
    const app = createApp(config, new InMemoryUsers());
    const registration = await request(app)
      .post("/auth/register")
      .send({ email: "alice@example.com", password: "correct-horse-battery" });

    expect((await request(app).get("/auth/me").set(bearer("invalid"))).status).toBe(401);
    expect((await request(app).get("/admin").set(bearer(registration.body.token))).status).toBe(403);
    expect((await request(app).get("/admin")).status).toBe(401);

    const admin = await new InMemoryUsers().create({
      email: "admin@example.com",
      passwordHash: await bcrypt.hash("admin-password", 10),
      role: "ADMIN",
    });
    const adminToken = jwt.sign(
      { email: admin.email, role: admin.role },
      secret,
      {
        algorithm: "HS256",
        subject: admin.id,
        issuer: "role-auth-jwt-microservice",
        audience: "role-auth-jwt-microservice",
        expiresIn: "15m",
      },
    );
    expect((await request(app).get("/admin").set(bearer(adminToken))).status).toBe(200);
  });
});
