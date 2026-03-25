import { BadRequestError } from "../errors/httpErrors.js";

export function validateUsername(username: string) {
  const usernamePattern = /^[a-zA-Z0-9][a-zA-Z0-9 _-]*[a-zA-Z0-9]$/;

  if (!usernamePattern.test(username) || username.trim() === "") {
    throw new BadRequestError("Invalid username format");
  }

  if (username.length < 3) {
    throw new BadRequestError("Username must at least be 3 characters long.");
  }

  if (username.length > 30) {
    throw new BadRequestError(
      "Username must not be more than 30 characters long.",
    );
  }
}

export function validatePfp(pfp: string, userId: string) {
  if (
    !pfp.startsWith(
      process.env.SUPABASE_URL +
        `/storage/v1/object/public/profile_pictures/${userId}`,
    ) ||
    pfp.trim() === ""
  ) {
    throw new BadRequestError("Invalid pfp url");
  }

  if (pfp.length > 2048) {
    throw new BadRequestError("profile URI too long");
  }
}

export function validateID(id: string) {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(id)) {
    throw new BadRequestError("Invalid ID format");
  }
}
