import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { User, AuthSession } from "./models.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "./jwt.js";
import { refreshCookieName, refreshCookiePath, isProd, refreshTtlMs } from "./config.js";
import argon2 from "argon2";
import { makeLoginLimiter } from "./rateLimit.js";

export const router = Router();

// --- Validation ---
const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(64).optional(),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

// --- Cookie Helpers ---
function setRefreshCookie(res: any, token: string) {
  res.cookie(refreshCookieName, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: refreshCookiePath,
  });
}
function clearRefreshCookie(res: any) {
  res.clearCookie(refreshCookieName, { path: refreshCookiePath });
}

// --- Revoke all sessions for a user ---
async function revokeAllUserSessions(userId: string) {
  await AuthSession.updateMany(
    { userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );
}

// --- REGISTER ---
router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, name, password } = parsed.data;
  const emailNormalized = email.trim().toLowerCase();

  const exists = await User.findOne({ emailNormalized });
  if (exists) return res.status(409).json({ error: "Email already in use" });

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await User.create({
    email,
    emailNormalized,
    name,
    passwordHash,
    roles: ["user"],
    isActive: true,
  });

  // Optional: Auto-Login
  const jti = uuid();
  const refresh = signRefreshToken({ sub: String(user._id), jti });
  await AuthSession.create({
    userId: user._id,
    jti,
    userAgent: req.get("user-agent") || undefined,
    ip: req.ip,
    expiresAt: new Date(Date.now() + refreshTtlMs),
  });

  const access = signAccessToken({ sub: String(user._id), roles: user.roles, email: user.email });
  setRefreshCookie(res, refresh);

  res.status(201).json({
    accessToken: access,
    user: { id: user._id, email: user.email, name: user.name, roles: user.roles },
  });
});

// --- LOGIN ---
router.post("/login", makeLoginLimiter(), async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password } = parsed.data;
  const emailNormalized = email.trim().toLowerCase();

  const user = await User.findOne({ emailNormalized });
  if (!user || !user.isActive) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await argon2.verify(user.passwordHash, password);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const jti = uuid();
  const refresh = signRefreshToken({ sub: String(user._id), jti });
  await AuthSession.create({
    userId: user._id,
    jti,
    userAgent: req.get("user-agent") || undefined,
    ip: req.ip,
    expiresAt: new Date(Date.now() + refreshTtlMs),
  });

  const access = signAccessToken({ sub: String(user._id), roles: user.roles, email: user.email });
  setRefreshCookie(res, refresh);

  res.json({
    accessToken: access,
    user: { id: user._id, email: user.email, name: user.name, roles: user.roles },
  });
});

// --- REFRESH (Rotation + Reuse-Detection) ---
router.post("/refresh", async (req, res) => {
  const token = req.cookies?.[refreshCookieName];
  if (!token) return res.status(401).json({ error: "Missing refresh token" });

  try {
    const payload = verifyRefreshToken(token); // RS256 mit Public Key
    if (payload.type !== "refresh") throw new Error("Wrong token type");

    const session = await AuthSession.findOne({ jti: payload.jti, userId: payload.sub });

    // Reuse-Detection: kryptografisch gültig, aber Session existiert nicht
    if (!session) {
      await revokeAllUserSessions(payload.sub);
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Reuse detected; sessions revoked" });
    }

    if (session.revokedAt) {
      await revokeAllUserSessions(String(session.userId));
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Session revoked; reuse suspected" });
    }

    // Rotation: aktuelle Session schließen
    session.rotatedAt = new Date();
    session.revokedAt = new Date();
    await session.save();

    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: "User inactive" });
    }

    // Neue Session + Tokens
    const newJti = uuid();
    const newRefresh = signRefreshToken({ sub: String(user._id), jti: newJti });
    await AuthSession.create({
      userId: user._id,
      jti: newJti,
      userAgent: req.get("user-agent") || undefined,
      ip: req.ip,
      expiresAt: new Date(Date.now() + refreshTtlMs),
    });

    const newAccess = signAccessToken({ sub: String(user._id), roles: user.roles, email: user.email });

    setRefreshCookie(res, newRefresh);
    return res.json({ accessToken: newAccess });
  } catch {
    clearRefreshCookie(res);
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

// --- LOGOUT (aktuelle Session widerrufen) ---
router.post("/logout", async (req, res) => {
  const token = req.cookies?.[refreshCookieName];
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await AuthSession.updateOne(
        { jti: payload.jti, userId: payload.sub },
        { $set: { revokedAt: new Date() } }
      );
    } catch { /* ignore */ }
  }
  clearRefreshCookie(res);
  return res.status(204).send();
});

export default router;
