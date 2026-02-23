import rateLimit, { ipKeyGenerator } from "express-rate-limit";

export function makeLoginLimiter() {
  return rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
      const email = (req.body?.email || "").toString().trim().toLowerCase();
      // Verwende ipKeyGenerator für korrekte IPv6-Behandlung (normalisiert IPv6-Subnetze)
      const normalizedIp = ipKeyGenerator(req.ip || "unknown");
      return `${normalizedIp}:${email}`;
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
}
