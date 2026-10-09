import { betterAuth } from "better-auth";
import { apiKey } from "better-auth/plugins";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create the database connection with correct path
const dbPath = path.resolve(__dirname, "..", "database.sqlite");
const db = new Database(dbPath);

const port = process.env.PORT || "3005";
const baseUrl = process.env.BETTER_AUTH_BASE_URL
  ? (process.env.BETTER_AUTH_BASE_URL.endsWith("/api/auth")
      ? process.env.BETTER_AUTH_BASE_URL
      : `${process.env.BETTER_AUTH_BASE_URL}/api/auth`)
  : `http://localhost:${port}/api/auth`;

const authConfig = {
  database: db,
  baseURL: baseUrl,
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:3000",
    "http://localhost:3005",
  ],
  plugins: [
    apiKey({
      defaultPrefix: "issues_",
      enableMetadata: true,
    }),
  ],
};

// Create auth instance
const authInstance = betterAuth(authConfig);

// Add event handlers after creating the instance
// Note: In Better Auth 1.3.x, events might need to be handled differently
// For now, we'll use a hook-based approach in the sign-up endpoint

export const auth = {
  handler: authInstance.handler,
  api: authInstance.api,
};
