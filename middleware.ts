import { NextRequest, NextResponse } from "next/server";

const legacyRoutes: Record<string,string> = {
  "/admin": "/school",
  "/network": "/alumni",
  "/mentoring": "/partnerships",
  "/profile": "/",
  "/contribute": "/javabdari",
  "/events": "/notices",
};

export function middleware(request: NextRequest) {
  const destination = legacyRoutes[request.nextUrl.pathname];
  if (!destination) return NextResponse.next();
  return NextResponse.redirect(new URL(destination, request.url), 308);
}

export const config = {
  matcher: ["/admin", "/network", "/mentoring", "/profile", "/contribute", "/events"],
};
