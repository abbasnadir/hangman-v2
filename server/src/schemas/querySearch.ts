import { z } from 'zod';

export const querySearchSchema = z.object({
  q: z.string().min(2).max(100),
  limit: z.number().min(1).max(100).default(10),
  page: z.number().min(1).default(1),
});