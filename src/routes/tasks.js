const express = require("express");
const { z } = require("zod");
const { query } = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

const taskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(1200).default(""),
  status: z.enum(["todo", "in_progress", "review", "done"]).default("todo"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  assigneeId: z.string().uuid().optional().nullable().or(z.literal("")),
  dueDate: z.string().date().optional().or(z.literal(""))
});

const statusSchema = z.object({
  status: z.enum(["todo", "in_progress", "review", "done"])
});

const commentSchema = z.object({
  body: z.string().trim().min(1).max(1000)
});

const uuidSchema = z.string().uuid();

function normalizeTask(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    assigneeEmail: row.assignee_email,
    createdBy: row.created_by,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getTaskById(id) {
  const { rows } = await query(
    `SELECT t.*, p.name AS project_name, u.name AS assignee_name, u.email AS assignee_email
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     LEFT JOIN users u ON u.id = t.assignee_id
     WHERE t.id = $1`,
    [id]
  );

  return rows[0] ? normalizeTask(rows[0]) : null;
}

async function validateProjectAssignment(projectId, assigneeId) {
  const project = await query("SELECT 1 FROM projects WHERE id = $1", [projectId]);

  if (!project.rows[0]) {
    return "Project not found.";
  }

  if (assigneeId) {
    const member = await query(
      "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, assigneeId]
    );

    if (!member.rows[0]) {
      return "Assignee must be a member of the selected project.";
    }
  }

  return null;
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const filters = [];
    const params = [];

    if (req.query.projectId) {
      uuidSchema.parse(req.query.projectId);
      params.push(req.query.projectId);
      filters.push(`t.project_id = $${params.length}`);
    }

    if (req.query.mine === "true") {
      params.push(req.user.id);
      filters.push(`t.assignee_id = $${params.length}`);
    }

    if (req.user.role !== "admin") {
      params.push(req.user.id);
      filters.push(`EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $${params.length})`);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const { rows } = await query(
      `SELECT t.*, p.name AS project_name, u.name AS assignee_name, u.email AS assignee_email
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN users u ON u.id = t.assignee_id
       ${where}
       ORDER BY
         CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         t.due_date ASC NULLS LAST,
         t.created_at DESC`,
      params
    );

    res.json({ tasks: rows.map(normalizeTask) });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = taskSchema.parse(req.body);
    const assignmentError = await validateProjectAssignment(input.projectId, input.assigneeId);

    if (assignmentError) {
      const status = assignmentError === "Project not found." ? 404 : 400;
      return res.status(status).json({ message: assignmentError });
    }

    const { rows } = await query(
      `INSERT INTO tasks (project_id, title, description, status, priority, assignee_id, due_date, created_by, completed_at)
       VALUES ($1, $2, $3, $4::task_status, $5::task_priority, $6, $7, $8, CASE WHEN $4::task_status = 'done' THEN now() ELSE null END)
       RETURNING *`,
      [
        input.projectId,
        input.title,
        input.description,
        input.status,
        input.priority,
        input.assigneeId || null,
        input.dueDate || null,
        req.user.id
      ]
    );

    res.status(201).json({ task: await getTaskById(rows[0].id) });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/status", requireAuth, async (req, res, next) => {
  try {
    const input = statusSchema.parse(req.body);
    const taskId = uuidSchema.parse(req.params.id);
    const access = await query(
      `SELECT t.project_id, t.assignee_id
       FROM tasks t
       WHERE t.id = $1`,
      [taskId]
    );

    if (!access.rows[0]) {
      return res.status(404).json({ message: "Task not found." });
    }

    req.params.projectId = access.rows[0].project_id;
    if (req.user.role !== "admin" && access.rows[0].assignee_id !== req.user.id) {
      return res.status(403).json({ message: "Only admins or the assignee can update this task." });
    }

    const { rows } = await query(
      `UPDATE tasks
       SET status = $1::task_status,
           completed_at = CASE WHEN $1::task_status = 'done' THEN COALESCE(completed_at, now()) ELSE null END,
           updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [input.status, taskId]
    );

    res.json({ task: await getTaskById(rows[0].id) });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = taskSchema.parse(req.body);
    const taskId = uuidSchema.parse(req.params.id);
    const assignmentError = await validateProjectAssignment(input.projectId, input.assigneeId);

    if (assignmentError) {
      const status = assignmentError === "Project not found." ? 404 : 400;
      return res.status(status).json({ message: assignmentError });
    }

    const { rows } = await query(
      `UPDATE tasks
       SET project_id = $1, title = $2, description = $3, status = $4::task_status, priority = $5::task_priority,
           assignee_id = $6, due_date = $7,
           completed_at = CASE WHEN $4::task_status = 'done' THEN COALESCE(completed_at, now()) ELSE null END,
           updated_at = now()
       WHERE id = $8
       RETURNING *`,
      [
        input.projectId,
        input.title,
        input.description,
        input.status,
        input.priority,
        input.assigneeId || null,
        input.dueDate || null,
        taskId
      ]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: "Task not found." });
    }

    res.json({ task: await getTaskById(rows[0].id) });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/comments", requireAuth, async (req, res, next) => {
  try {
    const input = commentSchema.parse(req.body);
    const taskId = uuidSchema.parse(req.params.id);
    const task = await query("SELECT project_id FROM tasks WHERE id = $1", [taskId]);

    if (!task.rows[0]) {
      return res.status(404).json({ message: "Task not found." });
    }

    if (req.user.role !== "admin") {
      const member = await query(
        "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
        [task.rows[0].project_id, req.user.id]
      );
      if (!member.rows[0]) {
        return res.status(403).json({ message: "You are not a member of this project." });
      }
    }

    const { rows } = await query(
      `INSERT INTO task_comments (task_id, user_id, body)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [taskId, req.user.id, input.body]
    );

    res.status(201).json({ comment: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete("/completed", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (req.query.projectId) {
      const projectId = uuidSchema.parse(req.query.projectId);
      const project = await query("SELECT 1 FROM projects WHERE id = $1", [projectId]);

      if (!project.rows[0]) {
        return res.status(404).json({ message: "Project not found." });
      }

      const { rows } = await query(
        "DELETE FROM tasks WHERE status = 'done'::task_status AND project_id = $1 RETURNING id",
        [projectId]
      );
      return res.json({ deleted: rows.length });
    }

    const { rows } = await query("DELETE FROM tasks WHERE status = 'done'::task_status RETURNING id");
    return res.json({ deleted: rows.length });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const taskId = uuidSchema.parse(req.params.id);
    await query("DELETE FROM tasks WHERE id = $1", [taskId]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
