import { getCookie, setCookie } from "hono/cookie";
import type { AppContext } from "./api-context";
import { createShareAccessCookieValue, isValidShareAccessCookieValue, SHARE_ACCESS_COOKIE, SHARE_ACCESS_MAX_AGE_SECONDS } from "./share-access";

export const shareAccessCookiePath = (token: string) => `/api/public/shares/${encodeURIComponent(token)}`;

export const setShareAccessCookie = async (c: AppContext, token: string, passwordHash: string, path = shareAccessCookiePath(token)) => {
  const value = await createShareAccessCookieValue(passwordHash, token);
  setCookie(c, SHARE_ACCESS_COOKIE, value, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path,
    maxAge: SHARE_ACCESS_MAX_AGE_SECONDS,
  });
};

/** Public share access requires a password unlock grant, even for the author. */
export const allowPasswordProtectedShare = async (
  c: AppContext,
  token: string,
  passwordHash: string,
) => isValidShareAccessCookieValue(getCookie(c, SHARE_ACCESS_COOKIE), passwordHash, token);
