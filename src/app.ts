import path from "node:path";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AuthService } from "./auth";
import type { AppConfig } from "./config";
import { HttpError } from "./errors";
import { authenticate, requireRole } from "./middleware/authenticate";
import type { UserRepository } from "./users";

const emailSchema = z.string().trim().email().max(320);
const registerPasswordSchema = z.string()
  .min(12)
  .max(128)
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72);
const loginPasswordSchema = z.string()
  .min(1)
  .max(128)
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72);
const registerSchema = z.object({
  email: emailSchema,
  password: registerPasswordSchema,
}).strict();
const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
}).strict();

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
) {
  return (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response).catch(next);
  };
}

function isDatabaseUnavailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (!("code" in error) && !("name" in error)) return false;

  const code = "code" in error ? error.code : undefined;
  const name = "name" in error ? error.name : undefined;
  return code === "ECONNREFUSED"
    || code === "P1001"
    || code === "P1002"
    || code === "P1017"
    || name === "PrismaClientInitializationError";
}

export function createApp(config: AppConfig, users: UserRepository) {
  const app = express();
  const auth = new AuthService(users, config);
  app.disable("x-powered-by");
  app.use(express.static(path.resolve(__dirname, "../public")));
  app.use(express.json({ limit: "10kb" }));

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.post("/auth/register", asyncRoute(async (request, response) => {
    const input = registerSchema.safeParse(request.body);
    if (!input.success) throw new HttpError(400, "Invalid registration input");
    const result = await auth.register(input.data.email, input.data.password);
    response.status(201).json(result);
  }));

  app.post("/auth/login", asyncRoute(async (request, response) => {
    const input = loginSchema.safeParse(request.body);
    if (!input.success) throw new HttpError(400, "Invalid login input");
    const result = await auth.login(input.data.email, input.data.password);
    response.status(200).json(result);
  }));

  app.get("/auth/me", authenticate(config.jwtSecret), asyncRoute(async (request, response) => {
    const user = await users.findById(request.auth!.sub);
    if (!user) throw new HttpError(401, "Invalid or expired token");
    response.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  }));

  app.get(
    "/admin",
    authenticate(config.jwtSecret),
    requireRole("ADMIN"),
    (_request, response) => {
      response.status(200).json({ message: "Admin access granted" });
    },
  );

  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    if (
      typeof error === "object"
      && error !== null
      && "type" in error
      && error.type === "entity.parse.failed"
    ) {
      response.status(400).json({ error: "Invalid JSON request body" });
      return;
    }
    if (
      typeof error === "object"
      && error !== null
      && "type" in error
      && error.type === "entity.too.large"
    ) {
      response.status(413).json({ error: "Request body is too large" });
      return;
    }
    if (error instanceof HttpError) {
      response.status(error.status).json({ error: error.message });
      return;
    }
    if (isDatabaseUnavailable(error)) {
      console.error("Authentication database is unavailable", error);
      response.status(503).json({
        error: "The authentication database is unavailable. Check DATABASE_URL and make sure the database is running.",
      });
      return;
    }
    console.error("Unhandled request error", error);
    response.status(500).json({ error: "Internal server error" });
  });

  return app;
}
