// Next can normalize request.url to localhost even when the browser used
// 127.0.0.1. Validate against the actual HTTP Host instead of that hostname.
export function sameOriginRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const requestUrl = new URL(request.url);
    const host = request.headers.get("host") || requestUrl.host;
    const expected = new URL(`${requestUrl.protocol}//${host}`);
    const incoming = new URL(origin);
    return ["http:", "https:"].includes(incoming.protocol) && incoming.origin === expected.origin;
  } catch { return false; }
}
