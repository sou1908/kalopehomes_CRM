import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // api/files is no longer excluded: it authenticates like everything else,
  // and skipping it here made it look deliberately unguarded.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
