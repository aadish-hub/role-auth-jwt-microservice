import { createApp } from "./app";
import { loadConfig } from "./config";
import { openUserRepository } from "./database";

async function main() {
  const config = loadConfig();
  const database = await openUserRepository(config);
  const app = createApp(config, database.users);
  const server = app.listen(config.port, () => {
    console.log(`Authentication service listening on port ${config.port}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await database.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error("Failed to start authentication service", error);
  process.exitCode = 1;
});
