import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { AppError } from "../utils/errors.js";

export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new AppError("Missing token", 401));

  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    const [[user]] = await pool.query(
      "SELECT id, name, username, role, active, must_change_password FROM users WHERE id = ?",
      [decoded.id]
    );
    if (!user || !user.active) return next(new AppError("Inactive user", 401));
    req.user = user;
    next();
  } catch {
    next(new AppError("Invalid or expired token", 401));
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.user.role)) return next(new AppError("Not allowed for this role", 403));
    next();
  };
}
