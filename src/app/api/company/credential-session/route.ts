// Proxy for the "View session JSON" eye button in the company Credentials
// panel. Forwards { companyId, platform, credentialId } to POST
// {TRACKVID_API_URL}/system-admin/credential-session, which returns ONE
// credential's cached cookie jar as stored.
//
// Unlike /api/company/list — whose session fields are a savedAt/expiresAt/
// source summary — the body coming back here holds live marketplace auth
// cookies. It is fetched on demand (never with the list) so the values only
// reach the browser when an operator explicitly opens one account's session,
// and the BE logs every such read against the caller's id.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/libs/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const accessToken = session?.accessToken;

  if (!accessToken) {
    return NextResponse.json(
      {
        isSuccess: false,
        message: "Not signed in",
        displayMessage: "Session expired — please sign in again.",
      },
      { status: 401 },
    );
  }

  const apiBase = process.env.TRACKVID_API_URL;

  if (!apiBase) {
    return NextResponse.json(
      { isSuccess: false, message: "TRACKVID_API_URL not configured" },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => ({}));

  const res = await fetch(
    `${apiBase.replace(/\/$/, "")}/system-admin/credential-session`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );

  const json = await res.json().catch(() => null);

  return NextResponse.json(
    json ?? { isSuccess: false, message: "Empty response from server" },
    { status: res.status },
  );
}
