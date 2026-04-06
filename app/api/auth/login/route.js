import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { username, password } = await request.json();

    const validUser = process.env.AUTH_USERNAME;
    const validPass = process.env.AUTH_PASSWORD;
    const secret    = process.env.AUTH_SECRET;

    if (!validUser || !validPass || !secret) {
      return NextResponse.json(
        { error: "Server misconfigured. Set AUTH_USERNAME, AUTH_PASSWORD, and AUTH_SECRET in .env.local" },
        { status: 500 }
      );
    }

    if (username !== validUser || password !== validPass) {
      // small delay to slow brute-force
      await new Promise(r => setTimeout(r, 600));
      return NextResponse.json({ error: "Username atau password salah." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set("zyeeque_auth", secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });
    return response;

  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
