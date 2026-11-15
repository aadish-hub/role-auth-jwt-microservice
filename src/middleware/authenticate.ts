import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../errors";
import { verifyToken } from "../auth";
import type { AppConfig } from "../config";
import type { UserRole } from "../users";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        sub: string;
        email: string;
        role: UserRole;
      };
    }
  }
}

export function authenticate(secret: AppConfig["jwtSecret"]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const header = request.header("authorization");
    const match = header?.match(/^Bearer ([^\s]+)$/i);
    if (!match) {
      next(new HttpError(401, "Authentication required"));
      return;
    }

    try {
      request.auth = verifyToken(match[1], secret);
      next();
    } catch (error) {
      next(error instanceof HttpError ? error : new HttpError(401, "Invalid or expired token"));
    }
  };
}

export function requireRole(role: UserRole) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.auth) {
      next(new HttpError(401, "Authentication required"));
      return;
    }
    if (request.auth.role !== role) {
      next(new HttpError(403, "Insufficient permissions"));
      return;
    }
    next();
  };
}

