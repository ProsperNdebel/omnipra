/**
 * Supabase Auth over plain fetch: email codes, sessions, refresh. No Node APIs, so
 * middleware (edge runtime) can refresh sessions with it too.
 */

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** Seconds since epoch. */
  expiresAt: number;
}

export interface AuthUser {
  id: string;
  email: string | null;
}

export class GoTrue {
  constructor(
    private readonly url: string,
    private readonly apiKey: string,
  ) {}

  /** Emails a one time code (and link, if the template includes it). Creates the account if new. */
  async sendCode(email: string): Promise<void> {
    await this.call("/otp", { email, create_user: true });
  }

  /** The 6 digit code from the email. */
  async verifyCode(email: string, code: string): Promise<AuthSession> {
    return session(
      await this.call("/verify", { type: "email", email, token: code }),
    );
  }

  /** The link variant: `token_hash` from the email's link. */
  async verifyLink(tokenHash: string, type: string): Promise<AuthSession> {
    return session(await this.call("/verify", { type, token_hash: tokenHash }));
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    return session(
      await this.call("/token?grant_type=refresh_token", {
        refresh_token: refreshToken,
      }),
    );
  }

  /** Who an access token belongs to, checked by Supabase. Null if invalid or expired. */
  async user(accessToken: string): Promise<AuthUser | null> {
    const res = await fetch(`${this.url}/auth/v1/user`, {
      headers: { apikey: this.apiKey, authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const u = (await res.json()) as { id: string; email?: string };
    return { id: u.id, email: u.email ?? null };
  }

  async signOut(accessToken: string): Promise<void> {
    await fetch(`${this.url}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: this.apiKey, authorization: `Bearer ${accessToken}` },
    }).catch(() => undefined);
  }

  private async call(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${this.url}/auth/v1${path}`, {
      method: "POST",
      headers: { apikey: this.apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!res.ok)
      throw new AuthError(
        res.status,
        String(
          json.msg ??
            json.error_description ??
            json.message ??
            "Sign in failed.",
        ),
      );
    return json;
  }
}

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function session(json: unknown): AuthSession {
  const j = json as {
    access_token: string;
    refresh_token: string;
    expires_at?: number;
    expires_in?: number;
  };
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt:
      j.expires_at ?? Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600),
  };
}

/** Seconds since epoch when a JWT expires, read without verifying it (only for timing a refresh). */
export function tokenExpiry(jwt: string): number | null {
  try {
    const part = jwt.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const exp = (JSON.parse(atob(part)) as { exp?: number }).exp;
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}
