const express = require("express");
const { query } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const params = [];
    let access = "";

    if (req.user.role !== "admin") {
      params.push(req.user.id);
      access = `WHERE EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = t.project_id AND pm.user_id = $1
      )`;
    }

    const summary = await query(
      `SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'todo')::int AS todo,
        count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
        count(*) FILTER (WHERE status = 'review')::int AS review,
        count(*) FILTER (WHERE status = 'done')::int AS done,
        count(*) FILTER (WHERE status <> 'done' AND due_date < CURRENT_DATE)::int AS overdue
       FROM tasks t
       ${access}`,
      params
    );

    const mine = await query(
      `SELECT count(*)::int AS assigned,
        count(*) FILTER (WHERE status <> 'done' AND due_date < CURRENT_DATE)::int AS overdue
       FROM tasks
       WHERE assignee_id = $1`,
      [req.user.id]
    );

    const upcoming = await query(
      `SELECT t.id, t.title, t.status, t.priority, t.due_date, p.name AS project_name
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE t.status <> 'done'
         AND t.due_date IS NOT NULL
         ${req.user.role === "admin" ? "" : "AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $1)"}
       ORDER BY t.due_date ASC
       LIMIT 8`,
      params
    );

    res.json({
      summary: summary.rows[0],
      mine: mine.rows[0],
      upcoming: upcoming.rows
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
