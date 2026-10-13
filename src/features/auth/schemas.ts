import { z } from "zod";

export const emailField = z
  .string()
  .min(1, "Enter your email address.")
  .email("That doesn't look like a valid email address.");

/**
 * Supabase enforces a 6-character minimum by default. We ask for 8 so the
 * client-side message matches what the server will actually accept.
 */
export const passwordField = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Passwords cannot exceed 72 characters.");

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password."),
});

export const signupSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name.").max(120),
  email: emailField,
  password: passwordField,
});

export const forgotPasswordSchema = z.object({ email: emailField });

export const resetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });
