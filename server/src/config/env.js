import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  HOST: z.string().default("0.0.0.0"),

  PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(4000),

  FRONTEND_URL: z.string().url(),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(6379),
  REDIS_PASSWORD: z.string().optional().default(""),

  SESSION_SECRET: z.string().min(32),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("❌ Invalid environment configuration:");
  console.error(result.error.format());

  process.exit(1);
}

export const env = result.data;