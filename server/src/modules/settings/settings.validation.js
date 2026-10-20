import { z } from "zod";

export const SMTP_SETTING_KEY = "smtp";

const optionalText = z.string().trim().max(255);

/*
 * An empty string is a valid stored value meaning "not configured", so the
 * editor can clear a field without sending null.
 */
const optionalEmail = z.union([
  z.literal(""),
  z.string().trim().email("Enter a valid email address").max(255),
]);

export const updateSmtpSchema = z
  .object({
    host: optionalText.optional(),
    port: z.coerce.number().int().min(1).max(65535).optional(),
    secure: z.boolean().optional(),
    username: optionalText.optional(),
    fromAddress: optionalEmail.optional(),
    authMode: z.enum(["password", "none"]).optional(),

    /*
     * Write-only. A password is never read back, so editing the other settings
     * leaves it untouched unless it is sent or cleared explicitly.
     */
    password: z.string().min(1, "Enter a password or clear it instead.").max(200).optional(),
    clearPassword: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const updateTurnstileSchema = z
  .object({
    enabled: z.boolean(),
    siteKey: optionalText.optional(),
    secretKey: z.string().min(1).max(255).optional(),
    clearSecret: z.boolean().optional(),
  });

