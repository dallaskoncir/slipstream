import { readFile } from "node:fs/promises";
import path from "node:path";

export interface UserRecord {
  id: string;
  name: string;
  email?: string;
}

export interface AdminRecord extends UserRecord {
  permissions: string[];
}

const USERS_DIR = path.resolve("./users");
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 25;

function assertUserRecord(value: unknown): UserRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as Record<string, unknown>).id !== "string" ||
    typeof (value as Record<string, unknown>).name !== "string"
  ) {
    throw new Error("Malformed user record");
  }
  const record = value as { id: string; name: string; email?: unknown };
  if (record.email !== undefined && typeof record.email !== "string") {
    throw new Error("Malformed user record");
  }
  return record.email === undefined
    ? { id: record.id, name: record.name }
    : { id: record.id, name: record.name, email: record.email };
}

/**
 * Loads a user record from disk and parses it as JSON.
 *
 * Rejects `id` values that aren't a simple identifier and verifies the
 * resolved path stays inside the users directory, so callers can't read
 * arbitrary files via path traversal. Retries transient read failures (not
 * a missing file or invalid JSON) up to `retries` times.
 */
export async function loadUser(id: string, retries = 0): Promise<UserRecord> {
  if (!ID_PATTERN.test(id)) {
    throw new Error("Invalid user id");
  }
  const filePath = path.resolve(USERS_DIR, `${id}.json`);
  // ID_PATTERN already excludes `.`, `/`, and `\`, so this can never actually
  // trigger — it's a secondary assertion, not the primary control. Don't loosen
  // ID_PATTERN without keeping this check meaningful.
  if (filePath !== path.join(USERS_DIR, `${id}.json`)) {
    throw new Error("Invalid user id");
  }

  const maxAttempts = Math.min(Math.max(retries, 0), MAX_RETRIES);
  for (let attempt = 0; ; attempt++) {
    try {
      const raw = await readFile(filePath, "utf-8");
      return assertUserRecord(JSON.parse(raw));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        throw new Error(`User not found: ${id}`);
      }
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid user data: ${id}`);
      }
      if (attempt >= maxAttempts) {
        throw new Error(`Failed to load user: ${id}`);
      }
      // Transient I/O error (e.g. EMFILE, EBUSY) — retry with backoff.
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** attempt));
    }
  }
}

export const formatUserName = (user: UserRecord, uppercase = false): string => {
  return uppercase ? user.name.toUpperCase() : user.name;
};
