const jwt = require("jsonwebtoken");
const { query } = require("../db");

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await query(
      "SELECT id, name, email, role, created_at FROM users WHERE id = $1",
      [payload.sub]
    );

    if (!rows[0]) {
      return res.status(401).json({ message: "User no longer exists." });
    }

    req.user = rows[0];
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }
  return next();
}

async function requireProjectAccess(req, res, next) {
  const projectId = req.params.projectId || req.params.id;

  if (!projectId) {
    return res.status(400).json({ message: "Project id is required." });
  }

  if (!uuidPattern.test(projectId)) {
    return res.status(400).json({ message: "Project id must be a valid UUID." });
  }

  if (req.user.role === "admin") {
    req.projectAccess = { role: "admin" };
    return next();
  }

  const { rows } = await query(
    "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, req.user.id]
  );

  if (!rows[0]) {
    return res.status(403).json({ message: "You are not a member of this project." });
  }

  req.projectAccess = rows[0];
  return next();
}

module.exports = { signToken, requireAuth, requireAdmin, requireProjectAccess };
