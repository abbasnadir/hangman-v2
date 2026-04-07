import { z } from "zod";

export const RouterObjectSchema = z.object({
  path: z.string(),
  functions: z.array(
    z.object({
      method: z.string(),
      handler: z.any(),
      authorization: z.string(),
      rateLimit: z.string(),
      keyType: z.string(),
      props: z.string().optional(),
      zodSchema: z.any().optional(),
    }),
  ),
});
