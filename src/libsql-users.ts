import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import type { Client, InValue } from "@libsql/client";
import type { UserRecord, UserRepository, UserRole } from "./users";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: string;
};

function toUserRecord(row: UserRow): UserRecord {
  if (row.role !== "USER" && row.role !== "ADMIN") {
    throw new Error(`Unexpected user role in database: ${row.role}`);
  }
  const createdAt = new Date(`${row.created_at.replace(" ", "T")}Z`);
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error("Invalid user creation timestamp in database");
  }
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt,
  };
}

async function findRow(
  client: Client,
  column: "id" | "email",
  value: string,
): Promise<UserRecord | null> {
  const result = await client.execute({
    sql: `SELECT id, email, password_hash, role, created_at FROM users WHERE ${column} = ? LIMIT 1`,
    args: [value],
  });
  const row = result.rows[0] as unknown as UserRow | undefined;
  return row ? toUserRecord(row) : null;
}

export async function createLibsqlUserRepository(
  databaseUrl: string,
  authToken?: string,
): Promise<{
  users: UserRepository;
  close: () => Promise<void>;
}> {
  if (!databaseUrl.startsWith("file::memory:")) {
    const baseUrl = pathToFileURL(path.join(process.cwd(), "database-url-base"));
    const databasePath = fileURLToPath(new URL(databaseUrl, baseUrl));
    await mkdir(path.dirname(databasePath), { recursive: true });
  }
  const client = createClient({ url: databaseUrl, authToken });
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    client.close();
    throw error;
  }

  const users: UserRepository = {
    findByEmail: (email) => findRow(client, "email", email),
    findById: (id) => findRow(client, "id", id),
    async create(input) {
      const id = crypto.randomUUID();
      await client.execute({
        sql: `INSERT INTO users (id, email, password_hash, role)
          VALUES (?, ?, ?, ?)`,
        args: [id, input.email, input.passwordHash, input.role] as InValue[],
      });
      const created = await findRow(client, "id", id);
      if (!created) throw new Error("User insert succeeded but the new record could not be read");
      return created;
    },
    async createInitialAdmin(input) {
      const id = crypto.randomUUID();
      await client.execute({
        sql: `INSERT INTO users (id, email, password_hash, role)
          VALUES (?, ?, ?, 'ADMIN') ON CONFLICT(email) DO NOTHING`,
        args: [id, input.email, input.passwordHash],
      });
      const admin = await findRow(client, "email", input.email);
      if (!admin) throw new Error("Admin bootstrap did not create or find the configured user");
      return admin;
    },
  };

  return { users, close: async () => client.close() };
}
