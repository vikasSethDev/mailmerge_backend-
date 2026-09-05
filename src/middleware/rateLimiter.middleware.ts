import rateLimit from 'express-rate-limit';

// Generic API abuse protection. This is unrelated to the per-campaign
// email sending rate limiter (see src/services/rateLimiter.service.ts), which governs
// how fast the worker is allowed to send emails through the provider.
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please slow down.' },
});

export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many upload requests, please slow down.' },
});
