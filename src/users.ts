export type UserRole = "USER" | "ADMIN";

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
};

export type PublicUser = Pick<UserRecord, "id" | "email" | "role" | "createdAt">;

export type UserRepository = {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: {
    email: string;
    passwordHash: string;
    role: UserRole;
  }): Promise<UserRecord>;
  createInitialAdmin(input: {
    email: string;
    passwordHash: string;
  }): Promise<UserRecord>;
};

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

