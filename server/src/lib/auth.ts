import { jwtVerify, importSPKI } from "jose";
import { UnauthorizedError } from "../errors/httpErrors.js";

const jwtKey = process.env.SUPABASE_JWT!;

const publicKey = await importSPKI(jwtKey, "ES256");

export default async function verifyJwt(token: string) {
  const { payload } = await jwtVerify(token, publicKey, {
    algorithms: ["ES256"],
    audience: "authenticated",
    issuer: `${process.env.SUPABASE_URL}/auth/v1`,
  });

  if (typeof payload.sub != "string") throw new UnauthorizedError();
  return {
    id: payload.sub as string,
    email: payload.email as string | undefined,
    role: payload.role as string | undefined,
  };
}
