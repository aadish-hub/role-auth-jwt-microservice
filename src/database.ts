import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { AppConfig } from "./config";
import { createLibsqlUserRepository } from "./libsql-users";
import { createPrismaUserRepository } from "./prisma-users";
import type { UserRepository } from "./users";

export async function openUserRepository(config: AppConfig): Promise<{
  users: UserRepository;
  close: () => Promise<void>;
}> {
  if (
    config.databaseUrl.startsWith("file:")
    || config.databaseUrl.startsWith("libsql://")
    || config.databaseUrl.startsWith("https://")
  ) {
    return createLibsqlUserRepository(config.databaseUrl, config.libsqlAuthToken);
  }

  const adapter = new PrismaPg({ connectionString: config.databaseUrl });
  const prisma = new PrismaClient({ adapter });
  return {
    users: createPrismaUserRepository(prisma),
    close: () => prisma.$disconnect(),
  };
}
