import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/asyncHandler.util';
import { logger } from '../config/logger';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }

  if (err instanceof ApiError) {
    if (err.statusCode >= 500) logger.error(err.message, { details: err.details });
    res.status(err.statusCode).json({ success: false, message: err.message, details: err.details });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unexpected error';
  logger.error('Unhandled error: %s', message, { err });
  res.status(500).json({ success: false, message: 'Internal server error' });
}
