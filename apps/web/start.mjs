import { VALIDATION_BODY_LIMIT } from './request-limits.mjs';

// Route-specific limits still bound generation requests to 4 MiB.
process.env.BODY_SIZE_LIMIT = String(VALIDATION_BODY_LIMIT);
await import('./build/index.js');
