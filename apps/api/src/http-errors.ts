import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

export const apiError = (c: Context, code: string, message: string, status: number) =>
  c.json(
    {
      error: {
        code,
        message,
      },
    },
    status as 400
  );

export const notFound = (c: Context, message: string) =>
  apiError(c, "not_found", message, 404);

export const badRequest = (c: Context, message: string) =>
  apiError(c, "bad_request", message, 400);

export const authNotConfigured = (c: Context) =>
  apiError(
    c,
    "auth_not_configured",
    "Authentication is not configured. Set EDGE_EVER_AUTH_PASSWORD as a Worker Secret and redeploy.",
    503,
  );

export const databaseNotReady = (c: Context) =>
  apiError(
    c,
    "database_not_ready",
    "Database is not ready. Bind the D1 database as DB and apply the remote migrations.",
    503,
  );

export const conflict = (c: Context, code: string, message: string) =>
  apiError(c, code, message, 409);

export const unauthorized = (c: Context, message: string) =>
  apiError(c, "unauthorized", message, 401);

export const forbidden = (c: Context, message: string) =>
  apiError(c, "forbidden", message, 403);

// Hono middleware (JSON validation, body limits) rejects bad requests by
// throwing HTTPException. Report those as client errors in the API's error
// shape instead of letting them surface as an internal server error.
export const httpExceptionError = (c: Context, error: unknown) => {
  if (!(error instanceof HTTPException) || error.status < 400 || error.status >= 500) return null;
  if (error.status === 413) {
    return apiError(c, "payload_too_large", "The request body is too large.", 413);
  }
  return apiError(c, "bad_request", error.message || "The request could not be read.", error.status);
};
