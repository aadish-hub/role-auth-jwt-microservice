import bcrypt from "bcryptjs";
import { loadConfig } from "../config";
import { openUserRepository } from "../database";

async function main() {
  const config = loadConfig();
  if (!config.adminEmail || !config.adminPassword) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required for admin bootstrap");
  }

  const database = await openUserRepository(config);
  try {
    const passwordHash = await bcrypt.hash(config.adminPassword, config.bcryptRounds);
    const admin = await database.users.createInitialAdmin({
      email: config.adminEmail,
      passwordHash,
    });
    if (admin.role !== "ADMIN") {
      throw new Error(
        `An existing ${admin.role} account uses ${config.adminEmail}; bootstrap will not change its role or password`,
      );
    }
    console.log(`Bootstrap complete; ${admin.email} has role ${admin.role}.`);
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error("Admin bootstrap failed", error);
  process.exitCode = 1;
});
