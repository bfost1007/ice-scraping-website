import assert from "node:assert/strict";
import { test } from "node:test";
import { signSession, verifySession, SESSION_SECONDS } from "../app/lib/session.ts";

process.env.INTERNAL_SESSION_TOKEN = "test-only-session-signing-key-never-used-by-the-app";
const workerId = "94b7a99d-3c83-42ae-a1b7-ae0c675ed038";

test("owner and worker sessions round-trip without exposing the signing key", async () => {
  for (const session of [{ role: "owner", name: "Blake" }, { role: "worker", name: "Maya", workerId }]) {
    const token = await signSession(session);
    assert.equal(token.includes(process.env.INTERNAL_SESSION_TOKEN), false);
    assert.deepEqual(await verifySession(token), session);
  }
});

test("tampered roles, raw legacy tokens, malformed and unsigned cookies are rejected", async () => {
  const token = await signSession({ role: "worker", name: "Maya", workerId });
  const [version, encoded, signature] = token.split(".");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
  payload.role = "owner";
  const forged = `${version}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`;
  for (const candidate of [forged, process.env.INTERNAL_SESSION_TOKEN, encoded, `${version}.${encoded}.invalid`, "not-a-session", undefined]) {
    assert.equal(await verifySession(candidate), null);
  }
});

test("sessions expire after eight hours", async () => {
  const token = await signSession({ role: "owner", name: "Blake" });
  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + (SESSION_SECONDS + 1) * 1000;
    assert.equal(await verifySession(token), null);
  } finally {
    Date.now = originalNow;
  }
});

test("worker sessions without a valid worker identity and missing configuration fail closed", async () => {
  assert.equal(await verifySession(await signSession({ role: "worker", name: "Maya" })), null);
  const token = await signSession({ role: "owner", name: "Blake" });
  const secret = process.env.INTERNAL_SESSION_TOKEN;
  try {
    delete process.env.INTERNAL_SESSION_TOKEN;
    assert.equal(await verifySession(token), null);
    await assert.rejects(signSession({ role: "owner", name: "Blake" }));
  } finally {
    process.env.INTERNAL_SESSION_TOKEN = secret;
  }
});
