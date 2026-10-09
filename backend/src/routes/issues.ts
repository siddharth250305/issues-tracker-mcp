import { FastifyPluginAsync } from "fastify";
import { getDatabase } from "../db/database.js";
import { authMiddleware, AuthenticatedRequest } from "../middleware.js";

export interface Issue {
  id: number;
  title: string;
  description: string | null;
  status: "not_started" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  assigned_user_id: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  // Populated from joins
  assigned_user?: {
    id: string;
    name: string;
    email: string;
  } | null;
  created_by_user?: {
    id: string;
    name: string;
    email: string;
  };
  tags?: Array<{
    id: number;
    name: string;
    color: string;
  }>;
}

export interface CreateIssueRequest {
  title: string;
  description?: string;
  status?: "not_started" | "in_progress" | "done";
  priority?: "low" | "medium" | "high" | "urgent";
  assigned_user_id?: string;
  tag_ids?: number[];
}

export interface UpdateIssueRequest {
  title?: string;
  description?: string;
  status?: "not_started" | "in_progress" | "done";
  priority?: "low" | "medium" | "high" | "urgent";
  assigned_user_id?: string;
  tag_ids?: number[];
}

export interface IssueFilters {
  status?: string;
  priority?: string;
  assigned_user_id?: string;
  created_by_user_id?: string;
  tag_id?: string;
  search?: string;
  limit?: string;
  offset?: string;
}

const issuesRoute: FastifyPluginAsync = async function (fastify) {
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

  // GET /api/issues - Get all issues with filtering and pagination
  fastify.get<{ Querystring: IssueFilters }>(
    "/",
    async function (request, reply) {
      try {
        const {
          status,
          priority,
          assigned_user_id,
          created_by_user_id,
          tag_id,
          search,
          limit = "50",
          offset = "0",
        } = request.query;

        const limitNum = Math.min(parseInt(limit) || 50, 100); // Max 100 items
        const offsetNum = parseInt(offset) || 0;

        const db = await getDatabase();

        // Build the query with filters
        let whereConditions = [];
        let params = [];

        if (status) {
          whereConditions.push("i.status = ?");
          params.push(status);
        }

        if (priority) {
          whereConditions.push("i.priority = ?");
          params.push(priority);
        }

        if (assigned_user_id) {
          whereConditions.push("i.assigned_user_id = ?");
          params.push(assigned_user_id);
        }

        if (created_by_user_id) {
          whereConditions.push("i.created_by_user_id = ?");
          params.push(created_by_user_id);
        }

        if (search) {
          whereConditions.push("(i.title LIKE ? OR i.description LIKE ?)");
          const searchTerm = `%${search}%`;
          params.push(searchTerm, searchTerm);
        }

        // Handle tag filtering with subquery
        if (tag_id) {
          whereConditions.push(
            "i.id IN (SELECT issue_id FROM issue_tags WHERE tag_id = ?)"
          );
          params.push(tag_id);
        }

        const whereClause =
          whereConditions.length > 0
            ? `WHERE ${whereConditions.join(" AND ")}`
            : "";

        // Main query to get issues with user details
        const issuesQuery = `
        SELECT 
          i.id,
          i.title,
          i.description,
          i.status,
          i.priority,
          i.assigned_user_id,
          i.created_by_user_id,
          i.created_at,
          i.updated_at,
          au.name as assigned_user_name,
          au.email as assigned_user_email,
          cu.name as created_by_user_name,
          cu.email as created_by_user_email
        FROM issues i
        LEFT JOIN user au ON i.assigned_user_id = au.id
        LEFT JOIN user cu ON i.created_by_user_id = cu.id
        ${whereClause}
        ORDER BY i.updated_at DESC, i.created_at DESC
        LIMIT ? OFFSET ?
      `;

        params.push(limitNum.toString(), offsetNum.toString());
        const issues = await db.all(issuesQuery, params);

        // Get tags for each issue
        const issueIds = issues.map((issue) => issue.id);
        let issueTags = [];

        if (issueIds.length > 0) {
          const placeholders = issueIds.map(() => "?").join(",");
          const tagsQuery = `
          SELECT 
            it.issue_id,
            t.id,
            t.name,
            t.color
          FROM issue_tags it
          JOIN tags t ON it.tag_id = t.id
          WHERE it.issue_id IN (${placeholders})
          ORDER BY t.name
        `;
          issueTags = await db.all(tagsQuery, issueIds);
        }

        // Group tags by issue
        const tagsByIssue = issueTags.reduce((acc, tag) => {
          if (!acc[tag.issue_id]) {
            acc[tag.issue_id] = [];
          }
          acc[tag.issue_id].push({
            id: tag.id,
            name: tag.name,
            color: tag.color,
          });
          return acc;
        }, {});

        // Format the response
        const formattedIssues = issues.map((issue) => ({
          id: issue.id,
          title: issue.title,
          description: issue.description,
          status: issue.status,
          priority: issue.priority,
          assigned_user_id: issue.assigned_user_id,
          created_by_user_id: issue.created_by_user_id,
          created_at: issue.created_at,
          updated_at: issue.updated_at,
          assigned_user: issue.assigned_user_id
            ? {
                id: issue.assigned_user_id,
                name: issue.assigned_user_name,
                email: issue.assigned_user_email,
              }
            : null,
          created_by_user: {
            id: issue.created_by_user_id,
            name: issue.created_by_user_name,
            email: issue.created_by_user_email,
          },
          tags: tagsByIssue[issue.id] || [],
        }));

        // Get total count for pagination
        const countQuery = `
        SELECT COUNT(*) as total
        FROM issues i
        ${whereClause}
      `;
        const countParams = params.slice(0, -2); // Remove limit and offset
        const countResult = await db.get(countQuery, countParams);

        await db.close();

        return {
          success: true,
          data: formattedIssues,
          pagination: {
            total: countResult.total,
            limit: limitNum,
            offset: offsetNum,
            hasMore: offsetNum + limitNum < countResult.total,
          },
        };
      } catch (error) {
        fastify.log.error({ err: error }, "Error fetching issues:");
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch issues",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // POST /api/issues - Create new issue
  fastify.post<{ Body: CreateIssueRequest }>(
    "/",
    async function (request, reply) {
      try {
        const {
          title,
          description,
          status = "not_started",
          priority = "medium",
          assigned_user_id,
          tag_ids = [],
        } = request.body;

        // Validate required fields
        if (!title || typeof title !== "string" || title.trim().length === 0) {
          return reply.status(400).send({
            success: false,
            error: "Validation error",
            message: "Title is required and must be a non-empty string",
          });
        }

        // Validate status
        const validStatuses = ["not_started", "in_progress", "done"];
        if (!validStatuses.includes(status)) {
          return reply.status(400).send({
            success: false,
            error: "Validation error",
            message: `Status must be one of: ${validStatuses.join(", ")}`,
          });
        }

        // Validate priority
        const validPriorities = ["low", "medium", "high", "urgent"];
        if (!validPriorities.includes(priority)) {
          return reply.status(400).send({
            success: false,
            error: "Validation error",
            message: `Priority must be one of: ${validPriorities.join(", ")}`,
          });
        }

        const trimmedTitle = title.trim();
        const db = await getDatabase();

        // Validate assigned user exists if provided
        if (assigned_user_id) {
          const userExists = await db.get("SELECT id FROM user WHERE id = ?", [
            assigned_user_id,
          ]);
          if (!userExists) {
            await db.close();
            return reply.status(400).send({
              success: false,
              error: "Validation error",
              message: `Assigned user with ID "${assigned_user_id}" does not exist`,
            });
          }
        }

        // Validate tags exist if provided
        if (tag_ids.length > 0) {
          const placeholders = tag_ids.map(() => "?").join(",");
          const existingTags = await db.all(
            `SELECT id FROM tags WHERE id IN (${placeholders})`,
            tag_ids
          );
          if (existingTags.length !== tag_ids.length) {
            await db.close();
            return reply.status(400).send({
              success: false,
              error: "Validation error",
              message: "One or more tag IDs are invalid",
            });
          }
        }

        // Get current user from auth middleware
        const currentUser = (request as AuthenticatedRequest).user;
        if (!currentUser) {
          await db.close();
          return reply.status(401).send({
            success: false,
            error: "Unauthorized",
            message: "User authentication required",
          });
        }

        // Create the issue
        const result = await db.run(
          `INSERT INTO issues (title, description, status, assigned_user_id, created_by_user_id, priority) 
         VALUES (?, ?, ?, ?, ?, ?)`,
          [
            trimmedTitle,
            description || null,
            status,
            assigned_user_id || null,
            currentUser.id,
            priority || "medium",
          ]
        );

        const issueId = result.lastID;

        // Add tags if provided
        if (tag_ids.length > 0) {
          const tagInserts = tag_ids.map((tagId) =>
            db.run("INSERT INTO issue_tags (issue_id, tag_id) VALUES (?, ?)", [
              issueId,
              tagId,
            ])
          );
          await Promise.all(tagInserts);
        }

        // Get the created issue with all details
        const newIssue = await db.get(
          `
        SELECT 
          i.id,
          i.title,
          i.description,
          i.status,
          i.priority,
          i.assigned_user_id,
          i.created_by_user_id,
          i.created_at,
          i.updated_at,
          au.name as assigned_user_name,
          au.email as assigned_user_email,
          cu.name as created_by_user_name,
          cu.email as created_by_user_email
        FROM issues i
        LEFT JOIN user au ON i.assigned_user_id = au.id
        LEFT JOIN user cu ON i.created_by_user_id = cu.id
        WHERE i.id = ?
      `,
          [issueId]
        );

        // Get tags for the new issue
        const issueTags = await db.all(
          `
        SELECT t.id, t.name, t.color
        FROM issue_tags it
        JOIN tags t ON it.tag_id = t.id
        WHERE it.issue_id = ?
        ORDER BY t.name
      `,
          [issueId]
        );

        await db.close();

        const formattedIssue = {
          ...newIssue,
          assigned_user: newIssue.assigned_user_id
            ? {
                id: newIssue.assigned_user_id,
                name: newIssue.assigned_user_name,
                email: newIssue.assigned_user_email,
              }
            : null,
          created_by_user: {
            id: newIssue.created_by_user_id,
            name: newIssue.created_by_user_name,
            email: newIssue.created_by_user_email,
          },
          tags: issueTags,
        };

        return reply.status(201).send({
          success: true,
          data: formattedIssue,
          message: "Issue created successfully",
        });
      } catch (error) {
        fastify.log.error({ err: error }, "Error creating issue:");
        return reply.status(500).send({
          success: false,
          error: "Failed to create issue",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // GET /api/issues/:id - Get specific issue
  fastify.get<{ Params: { id: string } }>(
    "/:id",
    async function (request, reply) {
      try {
        const { id } = request.params;
        const issueId = parseInt(id);

        if (isNaN(issueId)) {
          return reply.status(400).send({
            success: false,
            error: "Invalid issue ID",
            message: "Issue ID must be a number",
          });
        }

        const db = await getDatabase();

        const issue = await db.get(
          `
        SELECT 
          i.id,
          i.title,
          i.description,
          i.status,
          i.priority,
          i.assigned_user_id,
          i.created_by_user_id,
          i.created_at,
          i.updated_at,
          au.name as assigned_user_name,
          au.email as assigned_user_email,
          cu.name as created_by_user_name,
          cu.email as created_by_user_email
        FROM issues i
        LEFT JOIN user au ON i.assigned_user_id = au.id
        LEFT JOIN user cu ON i.created_by_user_id = cu.id
        WHERE i.id = ?
      `,
          [issueId]
        );

        if (!issue) {
          await db.close();
          return reply.status(404).send({
            success: false,
            error: "Issue not found",
            message: `Issue with ID ${issueId} does not exist`,
          });
        }

        // Get tags for the issue
        const issueTags = await db.all(
          `
        SELECT t.id, t.name, t.color
        FROM issue_tags it
        JOIN tags t ON it.tag_id = t.id
        WHERE it.issue_id = ?
        ORDER BY t.name
      `,
          [issueId]
        );

        await db.close();

        const formattedIssue = {
          ...issue,
          assigned_user: issue.assigned_user_id
            ? {
                id: issue.assigned_user_id,
                name: issue.assigned_user_name,
                email: issue.assigned_user_email,
              }
            : null,
          created_by_user: {
            id: issue.created_by_user_id,
            name: issue.created_by_user_name,
            email: issue.created_by_user_email,
          },
          tags: issueTags,
        };

        return {
          success: true,
          data: formattedIssue,
        };
      } catch (error) {
        fastify.log.error({ err: error }, "Error fetching issue:");
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch issue",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // PUT /api/issues/:id - Update issue
  fastify.put<{ Params: { id: string }; Body: UpdateIssueRequest }>(
    "/:id",
    async function (request, reply) {
      try {
        const { id } = request.params;
        const issueId = parseInt(id);

        if (isNaN(issueId)) {
          return reply.status(400).send({
            success: false,
            error: "Invalid issue ID",
            message: "Issue ID must be a number",
          });
        }

        const {
          title,
          description,
          status,
          priority,
          assigned_user_id,
          tag_ids,
        } = request.body;

        // Validate at least one field is being updated
        if (
          !title &&
          description === undefined &&
          !status &&
          !priority &&
          assigned_user_id === undefined &&
          !tag_ids
        ) {
          return reply.status(400).send({
            success: false,
            error: "Validation error",
            message: "At least one field must be provided for update",
          });
        }

        const db = await getDatabase();

        // Check if issue exists
        const existingIssue = await db.get(
          "SELECT id FROM issues WHERE id = ?",
          [issueId]
        );
        if (!existingIssue) {
          await db.close();
          return reply.status(404).send({
            success: false,
            error: "Issue not found",
            message: `Issue with ID ${issueId} does not exist`,
          });
        }

        // Validate fields if provided
        if (title !== undefined) {
          if (typeof title !== "string" || title.trim().length === 0) {
            await db.close();
            return reply.status(400).send({
              success: false,
              error: "Validation error",
              message: "Title must be a non-empty string",
            });
          }
        }

        if (status !== undefined) {
          const validStatuses = ["not_started", "in_progress", "done"];
          if (!validStatuses.includes(status)) {
            await db.close();
            return reply.status(400).send({
              success: false,
              error: "Validation error",
              message: `Status must be one of: ${validStatuses.join(", ")}`,
            });
          }
        }

        if (priority !== undefined) {
          const validPriorities = ["low", "medium", "high", "urgent"];
          if (!validPriorities.includes(priority)) {
            await db.close();
            return reply.status(400).send({
              success: false,
              error: "Validation error",
              message: `Priority must be one of: ${validPriorities.join(", ")}`,
            });
          }
        }

        if (assigned_user_id !== undefined && assigned_user_id !== null) {
          const userExists = await db.get("SELECT id FROM user WHERE id = ?", [
            assigned_user_id,
          ]);
          if (!userExists) {
            await db.close();
            return reply.status(400).send({
              success: false,
              error: "Validation error",
              message: `Assigned user with ID "${assigned_user_id}" does not exist`,
            });
          }
        }

        if (tag_ids !== undefined && tag_ids.length > 0) {
          const placeholders = tag_ids.map(() => "?").join(",");
          const existingTags = await db.all(
            `SELECT id FROM tags WHERE id IN (${placeholders})`,
            tag_ids
          );
          if (existingTags.length !== tag_ids.length) {
            await db.close();
            return reply.status(400).send({
              success: false,
              error: "Validation error",
              message: "One or more tag IDs are invalid",
            });
          }
        }

        // Build update query
        const updateFields = [];
        const updateParams = [];

        if (title !== undefined) {
          updateFields.push("title = ?");
          updateParams.push(title.trim());
        }
        if (description !== undefined) {
          updateFields.push("description = ?");
          updateParams.push(description);
        }
        if (status !== undefined) {
          updateFields.push("status = ?");
          updateParams.push(status);
        }
        if (priority !== undefined) {
          updateFields.push("priority = ?");
          updateParams.push(priority);
        }
        if (assigned_user_id !== undefined) {
          updateFields.push("assigned_user_id = ?");
          updateParams.push(assigned_user_id);
        }

        // Always update the updated_at timestamp
        updateFields.push("updated_at = CURRENT_TIMESTAMP");
        updateParams.push(issueId);

        // Update the issue
        await db.run(
          `UPDATE issues SET ${updateFields.join(", ")} WHERE id = ?`,
          updateParams
        );

        // Update tags if provided
        if (tag_ids !== undefined) {
          // Remove existing tags
          await db.run("DELETE FROM issue_tags WHERE issue_id = ?", [issueId]);

          // Add new tags
          if (tag_ids.length > 0) {
            const tagInserts = tag_ids.map((tagId) =>
              db.run(
                "INSERT INTO issue_tags (issue_id, tag_id) VALUES (?, ?)",
                [issueId, tagId]
              )
            );
            await Promise.all(tagInserts);
          }
        }

        // Get the updated issue with all details
        const updatedIssue = await db.get(
          `
        SELECT 
          i.id,
          i.title,
          i.description,
          i.status,
          i.priority,
          i.assigned_user_id,
          i.created_by_user_id,
          i.created_at,
          i.updated_at,
          au.name as assigned_user_name,
          au.email as assigned_user_email,
          cu.name as created_by_user_name,
          cu.email as created_by_user_email
        FROM issues i
        LEFT JOIN user au ON i.assigned_user_id = au.id
        LEFT JOIN user cu ON i.created_by_user_id = cu.id
        WHERE i.id = ?
      `,
          [issueId]
        );

        // Get tags for the updated issue
        const issueTags = await db.all(
          `
        SELECT t.id, t.name, t.color
        FROM issue_tags it
        JOIN tags t ON it.tag_id = t.id
        WHERE it.issue_id = ?
        ORDER BY t.name
      `,
          [issueId]
        );

        await db.close();

        const formattedIssue = {
          ...updatedIssue,
          assigned_user: updatedIssue.assigned_user_id
            ? {
                id: updatedIssue.assigned_user_id,
                name: updatedIssue.assigned_user_name,
                email: updatedIssue.assigned_user_email,
              }
            : null,
          created_by_user: {
            id: updatedIssue.created_by_user_id,
            name: updatedIssue.created_by_user_name,
            email: updatedIssue.created_by_user_email,
          },
          tags: issueTags,
        };

        return {
          success: true,
          data: formattedIssue,
          message: "Issue updated successfully",
        };
      } catch (error) {
        fastify.log.error({ err: error }, "Error updating issue:");
        return reply.status(500).send({
          success: false,
          error: "Failed to update issue",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // DELETE /api/issues/:id - Delete issue
  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    async function (request, reply) {
      try {
        const { id } = request.params;
        const issueId = parseInt(id);

        if (isNaN(issueId)) {
          return reply.status(400).send({
            success: false,
            error: "Invalid issue ID",
            message: "Issue ID must be a number",
          });
        }

        const db = await getDatabase();

        // Check if issue exists
        const existingIssue = await db.get(
          "SELECT id, title FROM issues WHERE id = ?",
          [issueId]
        );

        if (!existingIssue) {
          await db.close();
          return reply.status(404).send({
            success: false,
            error: "Issue not found",
            message: `Issue with ID ${issueId} does not exist`,
          });
        }

        // Delete the issue (cascading deletes will handle issue_tags)
        await db.run("DELETE FROM issues WHERE id = ?", [issueId]);
        await db.close();

        return {
          success: true,
          message: `Issue "${existingIssue.title}" deleted successfully`,
        };
      } catch (error) {
        fastify.log.error({ err: error }, "Error deleting issue:");
        return reply.status(500).send({
          success: false,
          error: "Failed to delete issue",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );
};

export default issuesRoute;
