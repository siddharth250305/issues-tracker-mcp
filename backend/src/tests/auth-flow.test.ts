import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp } from "../index.js";
import { FastifyInstance } from "fastify";
import "./setup.js";

describe("Authentication Flow", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // Use normal app with auth enabled for these tests
    app = await buildApp({ skipAuth: false });
    await app.ready();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("Protected Routes", () => {
    it("should require authentication for GET /api/issues", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/issues",
      });

      expect(response.statusCode).toBe(401);
      const data = JSON.parse(response.payload);
      expect(data.error).toBe("Unauthorized");
    });

    it("should require authentication for POST /api/issues", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/issues",
        payload: {
          title: "Test Issue",
          description: "Test description",
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("should require authentication for GET /api/tags", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/tags",
      });

      expect(response.statusCode).toBe(401);
    });

    it("should require authentication for GET /api/users", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/users",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("Public Routes", () => {
    it("should allow access to health check", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.status).toBe("healthy");
    });

    it("should allow access to root route", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/",
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.hello).toBe("world");
    });
  });

  describe("Auth Endpoints", () => {
    it("should respond to sign up endpoint", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/sign-up/email",
        payload: {
          email: "test-new@example.com",
          password: "password123",
          name: "Test User",
        },
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
        },
      });

      // BetterAuth should handle this - we just want to make sure the route exists
      // and doesn't return a 404
      expect(response.statusCode).not.toBe(404);
      expect(response.statusCode).not.toBe(403);
    });

    it("should respond to sign in endpoint", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/sign-in/email",
        payload: {
          email: "test@example.com",
          password: "password123",
        },
        headers: {
          "content-type": "application/json",
        },
      });

      // BetterAuth should handle this - we just want to make sure the route exists
      expect(response.statusCode).not.toBe(404);
    });

    it("should respond to session endpoint", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/auth/get-session",
      });

      // Should exist and not return 404
      expect(response.statusCode).not.toBe(404);
    });
  });

  describe("Invalid Authentication", () => {
    it("should reject invalid bearer token", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/issues",
        headers: {
          authorization: "Bearer invalid-token",
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("should reject malformed authorization header", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/issues",
        headers: {
          authorization: "InvalidFormat",
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("CORS Configuration", () => {
    it("should include CORS headers", async () => {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/api/issues",
        headers: {
          origin: "http://localhost:5173",
          "access-control-request-method": "GET",
        },
      });

      expect(response.headers["access-control-allow-origin"]).toBe(
        "http://localhost:5173"
      );
      expect(response.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("should allow configured methods", async () => {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/api/issues",
        headers: {
          origin: "http://localhost:5173",
          "access-control-request-method": "POST",
        },
      });

      const allowedMethods = response.headers["access-control-allow-methods"];
      expect(allowedMethods).toContain("POST");
      expect(allowedMethods).toContain("GET");
      expect(allowedMethods).toContain("PUT");
      expect(allowedMethods).toContain("DELETE");
    });
  });
});
