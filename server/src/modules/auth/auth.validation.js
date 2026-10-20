import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(255),

  password: z.string().min(1, "Password is required").max(128),

  "cf-turnstile-response": z.string().optional(),
  turnstileToken: z.string().optional(),
});
