import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySession } from "./app/lib/session";

export async function middleware(request: NextRequest) {
  if (!await verifySession(request.cookies.get(COOKIE_NAME)?.value)) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/internal/:path*"] };
