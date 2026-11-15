import "dotenv/config";
import { z } from "zod";

const durationPattern = /^[1-9]\d*[smhd]$/;
const maxTokenLifetimeSeconds = 7 * 24 * 60 * 60;
const durationMultipliers: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
};

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().refine((value) => {
    if (value.startsWith("file:")) return value.length > "file:".length;
    try {
      const url = new URL(value);
      return url.protocol === "postgres:" || url.protocol === "postgresql:";
    } catch {
      return false;
    }
  }, "must be a file: SQLite URL or PostgreSQL connection URL"),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string()
    .regex(durationPattern)
    .refine((value) => {
      const unit = value.slice(-1);
      const amount = Number(value.slice(0, -1));
      return amount * durationMultipliers[unit] <= maxTokenLifetimeSeconds;
    }, "must not exceed 7 days")
    .default("15m"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string()
    .min(12)
    .max(128)
    .refine((password) => Buffer.byteLength(password, "utf8") <= 72, "must be at most 72 UTF-8 bytes")
    .optional(),
}).superRefine((config, context) => {
  if (Boolean(config.ADMIN_EMAIL) !== Boolean(config.ADMIN_PASSWORD)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "ADMIN_EMAIL and ADMIN_PASSWORD must be provided together",
      path: ["ADMIN_EMAIL"],
    });
  }
});

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptRounds: number;
  adminEmail?: string;
  adminPassword?: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return {
    nodeEnv: parsed.data.NODE_ENV,
    port: parsed.data.PORT,
    databaseUrl: parsed.data.DATABASE_URL,
    jwtSecret: parsed.data.JWT_SECRET,
    jwtExpiresIn: parsed.data.JWT_EXPIRES_IN,
    bcryptRounds: parsed.data.BCRYPT_ROUNDS,
    adminEmail: parsed.data.ADMIN_EMAIL?.trim().toLowerCase(),
    adminPassword: parsed.data.ADMIN_PASSWORD,
  };
}
