import type { Request, Response } from "express";
import type { RouterObject } from "../../types/router.js";
import { supabase } from "../lib/supabaseClient.js";
import { NotFoundError } from "../errors/httpErrors.js";

/* GET home page. */
const relationsRouter: RouterObject = {
  path: "/relations",
  functions: [
    {
      method: "get",
      props: "/me/",
      authorization: "required",
      rateLimit: "read",
      keyType: "user",
      handler: async (req: Request, res: Response) => {
        const { data: relations, error } = await supabase
          .from("relationships")
          .select(
            `
            id,
            requester_id,
            addressee_id,
            status,
            requested_at,
            accepted_at,
            requester:profiles!relationships_requester_id_fkey (
              id,
              username,
              pfp,
              status,
              deleted_at
            ),
            addressee:profiles!relationships_addressee_id_fkey (
              id,
              username,
              pfp,
              status,
              deleted_at
            )
          `,
          )

          .or(`requester_id.eq.${req.user.id},addressee_id.eq.${req.user.id}`);

        if (error) {
          throw new NotFoundError(error.message || "Error fetching relations");
        }

        const result = relations.map((relation) => {
          if (
            relation.status === "accepted" &&
            new Date(relation.accepted_at).getTime() >
              Date.now() - 3 * 24 * 60 * 60 * 1000
          ) {
            relation.status = "new";
          }

          const otherUser =
            relation.requester_id === req.user.id
              ? relation.addressee?.[0]
              : relation.requester?.[0];

          return {
            id: relation.id,
            status: relation.status,
            requested_at: relation.requested_at,
            accepted_at: relation.accepted_at,
            other_user: {
              id: otherUser?.id,
              username: otherUser?.username,
              pfp: otherUser?.pfp,
              status: otherUser?.status,
            },
          };
        });

        res.status(200).json(result);
      },
    },
    // {
    //   method: "put",
    //   props: "/request/",
    //   authorization: "required",
    //   rateLimit: "strict",
    //   keyType: "user",
    //   handler: async (req: Request, res: Response) => {
    //     const { data: relations, error } = await supabase
    //       .from("relationships")
    //       .select(
    //         "id, requester_id, addressee_id, status, requested_at, accepted_at",
    //       )
    //       .eq("requester_id", `${req.user.id}`)
    //       .is("deleted_at", null);

    //     if (error) {
    //       throw new NotFoundError(error.message || "Error fetching relations");
    //     }

    //     res.status(200).json(relations);
    //   },
    // },
  ],
};

export default relationsRouter;
