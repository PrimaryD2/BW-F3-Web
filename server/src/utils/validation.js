import { AppError } from "./errors.js";

export function requireFields(body, fields) {
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      throw new AppError(`${field} is required`, 400);
    }
  }
}

export function assertEnum(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new AppError(`${field} must be one of: ${allowed.join(", ")}`, 400);
  }
}
