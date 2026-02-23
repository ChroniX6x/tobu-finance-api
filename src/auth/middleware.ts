import type { Request, Response, NextFunction } from "express-serve-static-core";
import { verifyAccessToken } from "./jwt";

declare module "express-serve-static-core" {
  interface Request {
    user?: { sub: string; roles?: string[]; email?: string };
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyAccessToken(token);
    req.user = { sub: payload.sub, roles: payload.roles, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const roles = req.user?.roles || [];
    if (!roles.includes(role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}
