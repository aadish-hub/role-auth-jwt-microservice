import type { Express, Request, Response } from "express";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { openUserRepository } from "../src/database";

let appPromise: Promise<Express> | undefined;

async function getApp(): Promise<Express> {
  if (!appPromise) {
    appPromise = (async () => {
      const config = loadConfig();
      const database = await openUserRepository(config);
      return createApp(config, database.users);
    })();
    appPromise.catch(() => {
      appPromise = undefined;
    });
  }
  return appPromise;
}

export default async function handler(
  request: Request,
  response: Response,
): Promise<void> {
  const route = request.query.route;
  if (typeof route === "string" && route.startsWith("/")) {
    const requestUrl = new URL(request.url ?? "/", "http://vercel.local");
    requestUrl.searchParams.delete("route");
    request.url = `${route}${requestUrl.search}`;
  }

  const app = await getApp();
  app(request, response);
}
