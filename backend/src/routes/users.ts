import { FastifyPluginAsync } from "fastify";
import { getDatabase } from "../db/database.js";
import { authMiddleware, AuthenticatedRequest } from "../middleware.js";

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}

const usersRoute: FastifyPluginAsync = async function (fastify) {
  // Add auth middleware to all routes in this plugin (unless in test mode)
  if (!(fastify as any).skipAuth) {
    fastify.addHook("preHandler", authMiddleware);
  } else {
    // In test mode, add a mock user
    fastify.addHook(
      "preHandler",
      async (request: AuthenticatedRequest, reply) => {
        request.user = {
          id: "test-user-1",
          email: "test@example.com",
          name: "Test User",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
    );
  }

  // GET /api/users - Get all users (for assignment dropdown)
  fastify.get("/", async function (request, reply) {
    try {
      const db = await getDatabase();

      // Get users from the BetterAuth user table
      const users = await db.all(`
        SELECT id, name, email, emailVerified, image, createdAt, updatedAt 
        FROM user 
        ORDER BY name ASC
      `);

      await db.close();

      return {
        success: true,
        data: users,
        count: users.length,
      };
    } catch (error) {
      fastify.log.error({ err: error }, "Error fetching users:");
      return reply.status(500).send({
        success: false,
        error: "Failed to fetch users",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // GET /api/users/:id - Get specific user
  fastify.get<{ Params: { id: string } }>(
    "/:id",
    async function (request, reply) {
      try {
        const { id } = request.params;

        const db = await getDatabase();

        const user = await db.get(
          `
        SELECT id, name, email, emailVerified, image, createdAt, updatedAt 
        FROM user 
        WHERE id = ?
      `,
          [id]
        );

        await db.close();

        if (!user) {
          return reply.status(404).send({
            success: false,
            error: "User not found",
            message: `User with ID ${id} does not exist`,
          });
        }

        return {
          success: true,
          data: user,
        };
      } catch (error) {
        fastify.log.error({ err: error }, "Error fetching user:");
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch user",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );
};

export default usersRoute;
