import bcrypt from "bcryptjs";
import type { SignOptions } from "jsonwebtoken";
import jwt from "jsonwebtoken";
import { HttpError } from "./errors";
import type { AppConfig } from "./config";
import type { PublicUser, UserRecord, UserRepository, UserRole } from "./users";
import { toPublicUser } from "./users";

const JWT_ISSUER = "role-auth-jwt-microservice";
const JWT_AUDIENCE = "role-auth-jwt-microservice";

export type AuthClaims = {
  sub: string;
  email: string;
  role: UserRole;
};

export type AuthResponse = {
  token: string;
  user: PublicUser;
};

function issueToken(user: UserRecord, config: AppConfig): string {
  const options: SignOptions = {
    algorithm: "HS256",
    subject: user.id,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: config.jwtExpiresIn as SignOptions["expiresIn"],
  };
  return jwt.sign({ email: user.email, role: user.role }, config.jwtSecret, options);
}

export function verifyToken(token: string, secret: string): AuthClaims {
  const payload = jwt.verify(token, secret, {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  if (
    typeof payload === "string"
    || typeof payload.sub !== "string"
    || typeof payload.email !== "string"
    || (payload.role !== "USER" && payload.role !== "ADMIN")
  ) {
    throw new HttpError(401, "Invalid or expired token");
  }
  return { sub: payload.sub, email: payload.email, role: payload.role };
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly config: AppConfig,
  ) {}

  async register(email: string, password: string): Promise<AuthResponse> {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.users.findByEmail(normalizedEmail);
    if (existing) throw new HttpError(409, "An account with this email already exists");

    const passwordHash = await bcrypt.hash(password, this.config.bcryptRounds);
    let user: UserRecord;
    try {
      user = await this.users.create({
        email: normalizedEmail,
        passwordHash,
        role: "USER",
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new HttpError(409, "An account with this email already exists");
      }
      throw error;
    }

    return { token: issueToken(user, this.config), user: toPublicUser(user) };
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const user = await this.users.findByEmail(email.trim().toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
    }
    return { token: issueToken(user, this.config), user: toPublicUser(user) };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    if (!("code" in error)) return false;
    return error.code === "P2002"
      || error.code === "SQLITE_CONSTRAINT"
      || error.code === "SQLITE_CONSTRAINT_UNIQUE";
  }
}
