import { FastifyPluginAsync } from "fastify";
import { getDatabase } from "../db/database.js";
import { authMiddleware, AuthenticatedRequest } from "../middleware.js";

export interface Tag {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface CreateTagRequest {
  name: string;
  color?: string;
}

const tagsRoute: FastifyPluginAsync = async function (fastify) {
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

  // GET /api/tags - Get all tags
  fastify.get("/", async function (request, reply) {
    try {
      const db = await getDatabase();

      const tags = await db.all(`
        SELECT id, name, color, created_at 
        FROM tags 
        ORDER BY name ASC
      `);

      await db.close();

      return {
        success: true,
        data: tags,
        count: tags.length,
      };
    } catch (error) {
      fastify.log.error({ err: error }, "Error fetching tags:");
      return reply.status(500).send({
        success: false,
        error: "Failed to fetch tags",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // POST /api/tags - Create new tag
  fastify.post<{ Body: CreateTagRequest }>(
    "/",
    async function (request, reply) {
      try {
        const { name, color = "#6366f1" } = request.body;

        // Validate required fields
        if (!name || typeof name !== "string" || name.trim().length === 0) {
          return reply.status(400).send({
            success: false,
            error: "Validation error",
            message: "Tag name is required and must be a non-empty string",
          });
        }

        // Validate color format (hex color)
        const colorRegex = /^#[0-9a-fA-F]{6}$/;
        if (!colorRegex.test(color)) {
          return reply.status(400).send({
            success: false,
            error: "Validation error",
            message: "Color must be a valid hex color (e.g., #ff0000)",
          });
        }

        const trimmedName = name.trim();
        const db = await getDatabase();

        // Check if tag name already exists
        const existingTag = await db.get(
          "SELECT id FROM tags WHERE LOWER(name) = LOWER(?)",
          [trimmedName]
        );

        if (existingTag) {
          await db.close();
          return reply.status(409).send({
            success: false,
            error: "Tag already exists",
            message: `A tag with the name "${trimmedName}" already exists`,
          });
        }

        // Create the tag
        const result = await db.run(
          "INSERT INTO tags (name, color) VALUES (?, ?)",
          [trimmedName, color]
        );

        // Get the created tag
        const newTag = await db.get(
          "SELECT id, name, color, created_at FROM tags WHERE id = ?",
          [result.lastID]
        );

        await db.close();

        return reply.status(201).send({
          success: true,
          data: newTag,
          message: "Tag created successfully",
        });
      } catch (error) {
        fastify.log.error({ err: error }, "Error creating tag:");
        return reply.status(500).send({
          success: false,
          error: "Failed to create tag",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // DELETE /api/tags/:id - Delete tag
  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    async function (request, reply) {
      try {
        const { id } = request.params;
        const tagId = parseInt(id);

        if (isNaN(tagId)) {
          return reply.status(400).send({
            success: false,
            error: "Invalid tag ID",
            message: "Tag ID must be a number",
          });
        }

        const db = await getDatabase();

        // Check if tag exists
        const existingTag = await db.get(
          "SELECT id, name FROM tags WHERE id = ?",
          [tagId]
        );

        if (!existingTag) {
          await db.close();
          return reply.status(404).send({
            success: false,
            error: "Tag not found",
            message: `Tag with ID ${tagId} does not exist`,
          });
        }

        // Check if tag is being used by any issues
        const tagUsage = await db.get(
          "SELECT COUNT(*) as count FROM issue_tags WHERE tag_id = ?",
          [tagId]
        );

        if (tagUsage.count > 0) {
          await db.close();
          return reply.status(400).send({
            success: false,
            error: "Tag in use",
            message: `Cannot delete tag "${existingTag.name}" because it is assigned to ${tagUsage.count} issue(s)`,
          });
        }

        // Delete the tag
        await db.run("DELETE FROM tags WHERE id = ?", [tagId]);
        await db.close();

        return {
          success: true,
          message: `Tag "${existingTag.name}" deleted successfully`,
        };
      } catch (error) {
        fastify.log.error({ err: error }, "Error deleting tag:");
        return reply.status(500).send({
          success: false,
          error: "Failed to delete tag",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // GET /api/tags/:id - Get specific tag
  fastify.get<{ Params: { id: string } }>(
    "/:id",
    async function (request, reply) {
      try {
        const { id } = request.params;
        const tagId = parseInt(id);

        if (isNaN(tagId)) {
          return reply.status(400).send({
            success: false,
            error: "Invalid tag ID",
            message: "Tag ID must be a number",
          });
        }

        const db = await getDatabase();

        const tag = await db.get(
          `
        SELECT id, name, color, created_at 
        FROM tags 
        WHERE id = ?
      `,
          [tagId]
        );

        await db.close();

        if (!tag) {
          return reply.status(404).send({
            success: false,
            error: "Tag not found",
            message: `Tag with ID ${tagId} does not exist`,
          });
        }

        return {
          success: true,
          data: tag,
        };
      } catch (error) {
        fastify.log.error({ err: error }, "Error fetching tag:");
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch tag",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );
};

export default tagsRoute;
