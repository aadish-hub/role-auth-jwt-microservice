import { Prisma, PrismaClient } from "@prisma/client";
import type { UserRepository } from "./users";

export function createPrismaUserRepository(prisma: PrismaClient): UserRepository {
  return {
    findByEmail: (email) => prisma.user.findUnique({ where: { email } }),
    findById: (id) => prisma.user.findUnique({ where: { id } }),
    create: (input) => prisma.user.create({ data: input }),
    async createInitialAdmin(input) {
      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      if (existing) return existing;

      try {
        return await prisma.user.create({
          data: { ...input, role: "ADMIN" },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError
          && error.code === "P2002"
        ) {
          const concurrentUser = await prisma.user.findUnique({
            where: { email: input.email },
          });
          if (concurrentUser) return concurrentUser;
        }
        throw error;
      }
    },
  };
}

