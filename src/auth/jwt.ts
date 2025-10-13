import jwt from "jsonwebtoken";
import { authEnv, keys } from "./config";

export type AccessPayload = {
  sub: string;           // user id
  roles?: string[];
  email?: string;
  type: "access";
};

export type RefreshPayload = {
  sub: string;           // user id
  jti: string;           // token id → Session-Kopplung
  type: "refresh";
};

export function signAccessToken(payload: Omit<AccessPayload, "type">) {
  return jwt.sign(
    { ...payload, type: "access" },
    keys.access.privateKey,
    { algorithm: "RS256", expiresIn: authEnv.ACCESS_TOKEN_TTL }
  );
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, keys.access.publicKey, { algorithms: ["RS256"] }) as AccessPayload;
}

export function signRefreshToken(payload: Omit<RefreshPayload, "type">) {
  return jwt.sign(
    { ...payload, type: "refresh" },
    keys.refresh.privateKey,
    { algorithm: "RS256", expiresIn: `${authEnv.REFRESH_TOKEN_TTL_DAYS}d` }
  );
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, keys.refresh.publicKey, { algorithms: ["RS256"] }) as RefreshPayload;
}
