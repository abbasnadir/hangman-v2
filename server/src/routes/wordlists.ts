import type { RouterObject } from "../../types/router.js";
import type { Request, Response } from "express";
import { supabase } from "../lib/supabaseClient.js";
import { BadRequestError } from "../errors/httpErrors.js";
import z from "zod";
import {
  idValueSchema,
  querySearchSchema,
  reasonableWordSchema,
  usernameValueSchema,
} from "../schemas/common.schemas.js";

const wordlistsRouter: RouterObject = {
  path: "/wordlists",
  functions: [
    {
      method: "get",
      props: "/",
      authorization: "optional",
      rateLimit: "read",
      keyType: "default",
      handler: async (_req: Request, res: Response) => {
        const { data: wordlists, error } = await supabase
          .from("wordlists")
          .select("name, words, id")
          .eq("default", true)
          .eq("public", true);

        if (error) {
          throw new BadRequestError(error.message);
        }
        res.status(200).json(wordlists);
      },
    },
    {
      method: "get",
      props: "/search/",
      authorization: "required",
      rateLimit: "read",
      keyType: "user",
      zodSchema: z.object({ query: querySearchSchema }),
      handler: async (_req: Request, res: Response) => {
        const query: string = res.locals.query.q;
        const limit: number = res.locals.query.limit;
        const page: number = res.locals.query.page;

        const { data: wordlists, error } = await supabase
          .from("wordlists")
          .select("owner_id, name, words, created_at, updated_at, default, id")
          .ilike("name", `%${query}%`)
          .is("public", true)
          .limit(limit)
          .range((page - 1) * limit, page * limit - 1);

        if (error) {
          throw new BadRequestError(error.message);
        }

        res.status(200).json(wordlists);
      },
    },
    {
      method: "get",
      props: "/me/",
      authorization: "required",
      rateLimit: "read",
      keyType: "user",
      handler: async (req: Request, res: Response) => {
        const { data: wordlists, error } = await supabase
          .from("wordlists")
          .select(
            "owner_id, name, words, created_at, updated_at, is_public, id",
          )
          .eq("owner_id", req.user.id);

        if (error) {
          throw new BadRequestError(error.message);
        }

        res.status(200).json(wordlists);
      },
    },
    {
      method: "post",
      props: "/me/",
      authorization: "required",
      rateLimit: "strict",
      keyType: "user",
      zodSchema: z.object({
        body: z.object({
          name: usernameValueSchema,
          words: z.array(reasonableWordSchema).max(250),
          is_public: z.boolean().default(false),
        }),
      }),
      handler: async (req: Request, res: Response) => {
        const name: string = res.locals.body.name;
        const words: string[] = res.locals.body.words;
        const is_public: boolean = res.locals.body.is_public;

        const { data: existingWordlist, error } = await supabase
          .from("wordlists")
          .select("id")
          .eq("owner_id", req.user.id)
          .eq("name", name);

        if (error) {
          throw new BadRequestError(error.message);
        }

        if (existingWordlist && existingWordlist.length > 0) {
          throw new BadRequestError(
            "You already have a wordlist with this name.",
          );
        }

        const { data: wordlists, error: insertError } = await supabase
          .from("wordlists")
          .insert({
            owner_id: req.user.id,
            name,
            words,
            public: is_public,
          })
          .select("*")
          .single();

        if (insertError) {
          throw new BadRequestError(insertError.message);
        }

        res.status(200).json(wordlists);
      },
    },
    {
      method: "patch",
      props: "/me/",
      authorization: "required",
      rateLimit: "strict",
      keyType: "user",
      zodSchema: z.object({
        body: z.object({
          id: idValueSchema,
          name: usernameValueSchema,
          words: z.array(reasonableWordSchema).max(250),
          is_public: z.boolean().default(false),
        }),
      }),
      handler: async (req: Request, res: Response) => {
        const id: string = res.locals.body.id;
        const name: string = res.locals.body.name;
        const words: string[] = res.locals.body.words;
        const is_public: boolean = res.locals.body.is_public;

        const { data: existingWordlist, error } = await supabase
          .from("wordlists")
          .select("id")
          .eq("id", id)
          .eq("owner_id", req.user.id);

        if (error) {
          throw new BadRequestError(error.message);
        }

        if (!existingWordlist) {
          throw new BadRequestError("Wordlist not found.");
        }

        const { data: conflictingWordlist, error: conflictError } =
          await supabase
            .from("wordlists")
            .select("id")
            .eq("owner_id", req.user.id)
            .eq("name", name)
            .neq("id", id)
            .single();

        if (conflictError && conflictError.code !== "PGRST116") {
          throw new BadRequestError(conflictError.message);
        }

        if (conflictingWordlist) {
          throw new BadRequestError(
            "You already have a wordlist with this name.",
          );
        }

        const { data: wordlist, error: updateError } = await supabase
          .from("wordlists")
          .update({
            name,
            words,
            public: is_public,
          })
          .eq("id", id)
          .eq("owner_id", req.user.id)
          .select("*")
          .single();

        if (updateError) {
          throw new BadRequestError(updateError.message);
        }

        res.status(200).json(wordlist);
      },
    },
    {
      method: "delete",
      props: "/me/",
      authorization: "required",
      rateLimit: "strict",
      keyType: "user",
      zodSchema: z.object({
        body: z.object({
          id: idValueSchema,
        }),
      }),
      handler: async (req: Request, res: Response) => {
        const id: string = res.locals.body.id;

        const { data: existingWordlist, error } = await supabase
          .from("wordlists")
          .select("id")
          .eq("id", id)
          .eq("owner_id", req.user.id);

        if (error) {
          throw new BadRequestError(error.message);
        }

        if (!existingWordlist) {
          throw new BadRequestError("Wordlist not found.");
        }

        const { error: deleteError } = await supabase
          .from("wordlists")
          .delete()
          .eq("id", id)
          .eq("owner_id", req.user.id);

        if (deleteError) {
          throw new BadRequestError(deleteError.message);
        }

        res.status(204).send();
      },
    },
  ],
};
