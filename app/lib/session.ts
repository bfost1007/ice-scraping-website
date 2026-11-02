import type { StaffSession } from "./staff-types";

export const COOKIE_NAME = "blake_internal_session";
export const SESSION_SECONDS = 60 * 60 * 8;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type SessionPayload = StaffSession & { issuedAt: number; expiresAt: number };

function encodeBase64(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid session encoding.");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

async function signingKey(): Promise<CryptoKey> {
  const secret = process.env.INTERNAL_SESSION_TOKEN;
  if (!secret) throw new Error("Internal login is not configured.");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

// Web Crypto keeps the same verification available in Next's Edge middleware.
export async function signSession(session: StaffSession): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { ...session, issuedAt: now, expiresAt: now + SESSION_SECONDS };
  const encoded = encodeBase64(encoder.encode(JSON.stringify(payload)));
  const value = `v1.${encoded}`;
  const signature = await crypto.subtle.sign("HMAC", await signingKey(), encoder.encode(value));
  return `${value}.${encodeBase64(new Uint8Array(signature))}`;
}

export async function verifySession(cookie: string | null | undefined): Promise<StaffSession | null> {
  if (!cookie || cookie.length > 4096 || !process.env.INTERNAL_SESSION_TOKEN) return null;
  try {
    const parts = cookie.split(".");
    if (parts.length !== 3 || parts[0] !== "v1") return null;
    const valid = await crypto.subtle.verify("HMAC", await signingKey(), decodeBase64(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
    if (!valid) return null;
    const payload: SessionPayload = JSON.parse(decoder.decode(decodeBase64(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(payload.issuedAt) || !Number.isInteger(payload.expiresAt) || payload.issuedAt > now + 60 || payload.expiresAt <= now || payload.expiresAt - payload.issuedAt !== SESSION_SECONDS) return null;
    if (typeof payload.name !== "string" || !payload.name || payload.name.length > 200) return null;
    if (payload.role === "owner") return { role: "owner", name: payload.name };
    if (payload.role === "worker" && typeof payload.workerId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.workerId)) {
      return { role: "worker", name: payload.name, workerId: payload.workerId };
    }
    return null;
  } catch {
    return null;
  }
}
