const express = require("express");
const { z } = require("zod");
const { query, tx } = require("../db");
const { requireAuth, requireAdmin, requireProjectAccess } = require("../middleware/auth");

const router = express.Router();

const projectSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).default(""),
  dueDate: z.string().date().optional().or(z.literal(""))
});

const memberSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  role: z.enum(["manager", "contributor"]).default("contributor")
});

const uuidSchema = z.string().uuid();

function normalizeProject(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    dueDate: row.due_date,
    createdBy: row.created_by,
    createdAt: row.created_at,
    totalTasks: Number(row.total_tasks || 0),
    doneTasks: Number(row.done_tasks || 0),
    overdueTasks: Number(row.overdue_tasks || 0),
    members: Number(row.members || 0)
  };
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const params = [];
    let accessWhere = "";

    if (req.user.role !== "admin") {
      params.push(req.user.id);
      accessWhere = "WHERE EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $1)";
    }

    const { rows } = await query(
      `SELECT p.*,
        count(DISTINCT t.id)::int AS total_tasks,
        count(DISTINCT t.id) FILTER (WHERE t.status = 'done')::int AS done_tasks,
        count(DISTINCT t.id) FILTER (WHERE t.status <> 'done' AND t.due_date < CURRENT_DATE)::int AS overdue_tasks,
        count(DISTINCT pm.user_id)::int AS members
       FROM projects p
       LEFT JOIN tasks t ON t.project_id = p.id
       LEFT JOIN project_members pm ON pm.project_id = p.id
       ${accessWhere}
       GROUP BY p.id
       ORDER BY p.updated_at DESC`,
      params
    );

    res.json({ projects: rows.map(normalizeProject) });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = projectSchema.parse(req.body);
    const project = await tx(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO projects (name, description, due_date, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [input.name, input.description, input.dueDate || null, req.user.id]
      );
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [rows[0].id, req.user.id]
      );
      return rows[0];
    });

    res.status(201).json({ project: normalizeProject(project) });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", requireAuth, requireProjectAccess, async (req, res, next) => {
  try {
    const projectResult = await query(
      `SELECT p.*,
        count(DISTINCT t.id)::int AS total_tasks,
        count(DISTINCT t.id) FILTER (WHERE t.status = 'done')::int AS done_tasks,
        count(DISTINCT t.id) FILTER (WHERE t.status <> 'done' AND t.due_date < CURRENT_DATE)::int AS overdue_tasks,
        count(DISTINCT pm.user_id)::int AS members
       FROM projects p
       LEFT JOIN tasks t ON t.project_id = p.id
       LEFT JOIN project_members pm ON pm.project_id = p.id
       WHERE p.id = $1
       GROUP BY p.id`,
      [req.params.id]
    );

    if (!projectResult.rows[0]) {
      return res.status(404).json({ message: "Project not found." });
    }

    const membersResult = await query(
      `SELECT u.id, u.name, u.email, u.role AS app_role, pm.role AS project_role
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1
       ORDER BY pm.added_at ASC`,
      [req.params.id]
    );

    res.json({
      project: normalizeProject(projectResult.rows[0]),
      members: membersResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        appRole: row.app_role,
        projectRole: row.project_role
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const projectId = uuidSchema.parse(req.params.id);
    const input = projectSchema.parse(req.body);
    const { rows } = await query(
      `UPDATE projects
       SET name = $1, description = $2, due_date = $3, updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [input.name, input.description, input.dueDate || null, projectId]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: "Project not found." });
    }

    res.json({ project: normalizeProject(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/members", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const projectId = uuidSchema.parse(req.params.id);
    const input = memberSchema.parse(req.body);
    const projectResult = await query("SELECT 1 FROM projects WHERE id = $1", [projectId]);

    if (!projectResult.rows[0]) {
      return res.status(404).json({ message: "Project not found." });
    }

    const userResult = await query("SELECT id, name, email FROM users WHERE email = $1", [input.email]);

    if (!userResult.rows[0]) {
      return res.status(404).json({ message: "Ask this teammate to sign up before adding them." });
    }

    await query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, $3::project_role)
       ON CONFLICT (project_id, user_id)
       DO UPDATE SET role = EXCLUDED.role`,
      [projectId, userResult.rows[0].id, input.role]
    );

    res.status(201).json({ member: userResult.rows[0], role: input.role });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const projectId = uuidSchema.parse(req.params.id);
    const { rows } = await query("DELETE FROM projects WHERE id = $1 RETURNING id", [projectId]);

    if (!rows[0]) {
      return res.status(404).json({ message: "Project not found." });
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.delete("/:id/members/:userId", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const projectId = uuidSchema.parse(req.params.id);
    const userId = uuidSchema.parse(req.params.userId);
    await query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [projectId, userId]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
