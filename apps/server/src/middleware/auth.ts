import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { verifyAccessToken } from "../lib/auth.js";

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export function requireAuth(request: AuthenticatedRequest, _response: Response, next: NextFunction) {
  const [scheme, token] = request.header("authorization")?.split(" ") ?? [];
  if (scheme !== "Bearer" || !token) {
    return next(new AppError(401, "UNAUTHORIZED", "Authentication is required."));
  }
  try {
    request.userId = verifyAccessToken(token).sub;
    return next();
  } catch (error) {
    return next(error);
  }
}
