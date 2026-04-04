import rateLimit, { ipKeyGenerator } from "express-rate-limit";

type keyType = "ip" | "user" | "default";

class RateLimiter {
  /* Dynamic rate limiting, based on the use case of API.
  Types are linked with `types/router.ts` so update it
  with this for adding new values.
  */
  private limits = {
    strict: { windowMs: 60_000, max: 10 },
    gameplay: { windowMs: 60_000, max: 60 },
    read: { windowMs: 60_000, max: 300 },
  } as const;

  limit(policy: keyof typeof this.limits, keyType: keyType) {
    return rateLimit({
      // Deconstruct the parameters passed earlier, based on dynamic policy
      ...this.limits[policy],

      /* Set the parameter on which rate-limiting will work.
      Defaults to `req.ip` if user is not defined. Used in combination
      with authHandler to return early if auth is must for rate limiting.
      */
      keyGenerator: (req) => {
        if (keyType === "user") return req.user!.id;
        if (keyType === "ip") return ipKeyGenerator(req.ip!,56);
        return req.user?.id ?? ipKeyGenerator(req.ip!,56);
      },
    });
  }
}

export const rateLimiter = new RateLimiter();
