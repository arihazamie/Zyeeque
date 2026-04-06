import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("zyeeque_auth", "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
  });
  return response;
}
