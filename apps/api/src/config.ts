import dotenv from 'dotenv';
import { z } from 'zod';

// Local dev reads apps/api/.env first, then the repo root .env. In Docker the variables come from compose.
dotenv.config({ path: ['.env', '../../.env'] });

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  ADMIN_USERNAME: z.string().min(1).default('admin'),
  ADMIN_PASSWORD: z.string().min(1).optional(),
});

export const config = schema.parse(process.env);
