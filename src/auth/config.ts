import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CORS_ORIGIN: z.string().default("http://localhost:4200"),

  // Access JWT (RS256)
  JWT_ACCESS_PRIVATE_KEY_PEM: z.string().min(1, "Missing ACCESS private key PEM"),
  JWT_ACCESS_PUBLIC_KEY_PEM: z.string().min(1, "Missing ACCESS public key PEM"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),

  // Refresh JWT (RS256) – getrenntes Keypair empfohlen
  JWT_REFRESH_PRIVATE_KEY_PEM: z.string().min(1, "Missing REFRESH private key PEM"),
  JWT_REFRESH_PUBLIC_KEY_PEM: z.string().min(1, "Missing REFRESH public key PEM"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid Auth ENV:", parsed.error.flatten());
  process.exit(1);
}

export const authEnv = parsed.data;
export const isProd = authEnv.NODE_ENV === "production";

export const refreshCookieName = "rt";
export const refreshCookiePath = "/api/auth/refresh";
export const refreshTtlMs = authEnv.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Hilfsfunktion: Transformiert evtl. „escaped“ Newlines in echte PEM-Zeilenumbrüche,
 * falls Keys als 1-Zeilen-ENV geliefert werden (CI/K8s).
 */
function normalizePEM(pem: string) {
  return pem.replace(/\\n/g, "\n");
}

export const keys = {
  access: {
    privateKey: normalizePEM(authEnv.JWT_ACCESS_PRIVATE_KEY_PEM),
    publicKey: normalizePEM(authEnv.JWT_ACCESS_PUBLIC_KEY_PEM),
  },
  refresh: {
    privateKey: normalizePEM(authEnv.JWT_REFRESH_PRIVATE_KEY_PEM),
    publicKey: normalizePEM(authEnv.JWT_REFRESH_PUBLIC_KEY_PEM),
  },
} as const;
