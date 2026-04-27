import { NextRequest, NextResponse } from "next/server";
import { deleteSession, SESSION_COOKIE_NAME } from "@/core/auth/session";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME())?.value;

  if (token) {
    await deleteSession(token);
  }

  const response = NextResponse.redirect(new URL("/sign-in", req.url));
  response.cookies.delete(SESSION_COOKIE_NAME());
  return response;
}
