const bcrypt = require("bcryptjs");
const express = require("express");
const { z } = require("zod");
const { query } = require("../db");
const { signToken, requireAuth } = require("../middleware/auth");

const router = express.Router();

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(100)
});

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1)
});

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.created_at
  };
}

router.post("/signup", async (req, res, next) => {
  try {
    const input = signupSchema.parse(req.body);
    const existingUsers = await query("SELECT count(*)::int AS count FROM users");
    const role = existingUsers.rows[0].count === 0 ? "admin" : "member";
    const passwordHash = await bcrypt.hash(input.password, 12);

    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [input.name, input.email, passwordHash, role]
    );

    const user = rows[0];
    return res.status(201).json({ user: publicUser(user), token: signToken(user) });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "An account with this email already exists." });
    }
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const { rows } = await query("SELECT * FROM users WHERE email = $1", [input.email]);
    const user = rows[0];

    if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    return res.json({ user: publicUser(user), token: signToken(user) });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
