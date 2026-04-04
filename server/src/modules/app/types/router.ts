import type { RequestHandler } from "express";
import type { ZodObject } from "zod";

export interface RouterObject {
  path: string;
  functions: APIObject[];
}

export interface APIObject {
  method: method;
  props?: string;
  authorization: authorization;
  rateLimit: rateLimit;
  keyType: keyType;
  zodSchema?: ZodObject;
  handler: RequestHandler;
}

export type method = "get" | "post" | "put" | "patch" | "delete";
export type authorization = "required" | "optional" | "none";
export type rateLimit = "strict" | "gameplay" | "read";
export type keyType = "ip" | "user" | "default";
