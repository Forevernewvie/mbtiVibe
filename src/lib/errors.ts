import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { logger } from "@/lib/logger";

/**
 * Normalized application error model for API routes and services.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Throws when payload validation fails.
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

/**
 * Throws when user requests unavailable resources.
 */
export class NotFoundError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 404, "NOT_FOUND", details);
  }
}

/**
 * Throws when a request is not authorized.
 */
export class UnauthorizedError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 401, "UNAUTHORIZED", details);
  }
}

/**
 * Throws when request rate exceeds configured quota.
 */
export class RateLimitError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 429, "RATE_LIMIT_EXCEEDED", details);
  }
}

/**
 * Throws when request violates business preconditions.
 */
export class BadRequestError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, "BAD_REQUEST", details);
  }
}

/**
 * Throws when a paid resource is requested without payment proof.
 */
export class PaymentRequiredError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 402, "PAYMENT_REQUIRED", details);
  }
}

/**
 * Converts unknown runtime errors into safe HTTP JSON responses.
 */
export function toErrorResponse(error: unknown, context: Record<string, unknown>) {
  if (error instanceof AppError) {
    logger.warn(error.message, {
      ...context,
      code: error.code,
      details: error.details,
      statusCode: error.statusCode,
    });

    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        details: error.details,
      },
      { status: error.statusCode },
    );
  }

  if (error instanceof ZodError) {
    logger.warn("Schema validation failed", {
      ...context,
      issues: error.flatten().fieldErrors,
    });

    return NextResponse.json(
      {
        error: "잘못된 요청 형식입니다.",
        code: "VALIDATION_ERROR",
        issues: error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  logger.error("Unexpected server error", {
    ...context,
    message: error instanceof Error ? error.message : "unknown error",
  });

  return NextResponse.json(
    {
      error: "서버 내부 오류가 발생했습니다.",
      code: "INTERNAL_SERVER_ERROR",
    },
    { status: 500 },
  );
}
