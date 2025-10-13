import rateLimit from "express-rate-limit";

export function makeLoginLimiter() {
  return rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
      const email = (req.body?.email || "").toString().trim().toLowerCase();
      return `${req.ip}:${email}`;
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
}
