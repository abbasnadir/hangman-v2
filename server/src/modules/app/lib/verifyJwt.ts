import { jwtVerify, createRemoteJWKSet } from "jose";
import { UnauthorizedError } from "../errors/httpErrors.js";

// Use JWKS to dynamically get JWT key
const PROJECT_JWKS = createRemoteJWKSet(
  new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);

export default async function verifyJwt(token: string) {
  const { payload } = await jwtVerify(token, PROJECT_JWKS);

  if (typeof payload.sub != "string") {
    throw new UnauthorizedError();
  }

  return {
    id: payload.sub as string,
    email: payload.email as string | undefined,
    role: payload.role as string | undefined,
  };
}
