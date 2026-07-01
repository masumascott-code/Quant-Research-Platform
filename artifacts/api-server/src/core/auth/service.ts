import type { AppUser } from "@workspace/db";
import type { Role } from "../../config/security";

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 1024;
const MAX_EMAIL_LENGTH = 254;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 32;
const USERNAME_PATTERN = /^[a-z0-9._-]+$/;

export interface AuthenticatedUser {
  username: string;
  role: Role;
  userId?: number;
}

export interface RegistrationInput {
  email: string;
  username: string;
  password: string;
}

export type RegistrationStatus = "pending" | "active";

export type RegistrationValidationResult =
  | { ok: true; input: RegistrationInput }
  | { ok: false; message: string };

export interface AuthDependencies {
  findUserByIdentifier(identifier: string): Promise<AppUser | null>;
  verifyPassword(user: AppUser, password: string): Promise<boolean>;
  updateLastLoginAt(userId: number): Promise<void>;
  authenticateFallback(username: string, password: string): AuthenticatedUser | null;
}

export interface RegistrationDependencies {
  findUserByIdentifier(identifier: string): Promise<AppUser | null>;
  createUser(input: RegistrationInput): Promise<AppUser>;
  autoApprove: boolean;
}

export function validateRegistrationBody(body: unknown): RegistrationValidationResult {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Invalid registration body" };
  }

  const candidate = body as Record<string, unknown>;
  const email = typeof candidate.email === "string" ? candidate.email.trim() : "";
  const username = typeof candidate.username === "string" ? candidate.username.trim() : "";
  const password = typeof candidate.password === "string" ? candidate.password : "";

  if (!email || !isValidEmail(email)) {
    return { ok: false, message: "Valid email is required" };
  }

  const normalizedUsername = username.toLowerCase();
  if (
    normalizedUsername.length < MIN_USERNAME_LENGTH ||
    normalizedUsername.length > MAX_USERNAME_LENGTH ||
    !USERNAME_PATTERN.test(normalizedUsername)
  ) {
    return { ok: false, message: "Username must be 3-32 characters using letters, numbers, dots, underscores, or hyphens" };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: "Password must be at least 12 characters" };
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, message: "Password is too long" };
  }

  return {
    ok: true,
    input: {
      email,
      username,
      password,
    },
  };
}

export async function authenticateDbUserOrFallback(
  username: string,
  password: string,
  deps: AuthDependencies,
): Promise<AuthenticatedUser | null> {
  const dbUser = await deps.findUserByIdentifier(username);
  if (!dbUser) {
    return deps.authenticateFallback(username, password);
  }

  if (dbUser.status !== "active") {
    return null;
  }

  const passwordOk = await deps.verifyPassword(dbUser, password);
  if (!passwordOk) {
    return null;
  }

  await deps.updateLastLoginAt(dbUser.id);
  return {
    username: dbUser.username,
    role: dbUser.role,
    userId: dbUser.id,
  };
}

export async function registerPublicUser(
  input: RegistrationInput,
  deps: RegistrationDependencies,
): Promise<{ status: RegistrationStatus; duplicate: boolean }> {
  const existingEmail = await deps.findUserByIdentifier(input.email);
  const existingUsername = await deps.findUserByIdentifier(input.username);
  if (existingEmail || existingUsername) {
    return {
      status: deps.autoApprove ? "active" : "pending",
      duplicate: true,
    };
  }

  try {
    const user = await deps.createUser(input);
    return {
      status: user.status === "active" ? "active" : "pending",
      duplicate: false,
    };
  } catch (err) {
    if (isDuplicateUserError(err)) {
      return {
        status: deps.autoApprove ? "active" : "pending",
        duplicate: true,
      };
    }

    throw err;
  }
}

export function registrationAcceptedMessage(status: RegistrationStatus): string {
  if (status === "active") {
    return "Registration accepted. You can sign in after your account is ready.";
  }

  return "Registration request received. An administrator may need to approve the account before login.";
}

function isValidEmail(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isDuplicateUserError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const record = err as Record<string, unknown>;
  if (record.code === "23505") return true;

  const message = typeof record.message === "string" ? record.message : "";
  return message.includes("idx_app_users_normalized_email") ||
    message.includes("idx_app_users_normalized_username") ||
    message.includes("app_users_normalized_email") ||
    message.includes("app_users_normalized_username");
}
