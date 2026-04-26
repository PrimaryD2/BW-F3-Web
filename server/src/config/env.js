import "dotenv/config";

export const env = {
  port: Number(process.env.PORT || 4000),
  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || "f3_factory",
    user: process.env.DB_USER || "f3_user",
    password: process.env.DB_PASSWORD || "f3_password"
  },
  jwtSecret: process.env.JWT_SECRET || "dev-only-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  clientOrigin: process.env.CLIENT_ORIGIN || "*",
  targetHoursPerDay: Number(process.env.TARGET_HOURS_PER_DAY || 24)
};
