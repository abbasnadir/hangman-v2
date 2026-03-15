import type { Request, Response } from "express";
import type { RouterObject } from "../../types/router.js";
import { supabase } from "../lib/supabaseClient.js";
import { BadRequestError, NotFoundError } from "../errors/httpErrors.js";
import { fetchUserWithId, validateID } from "../utils/validators.js";

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
              created_at,
              deleted_at
            ),
            addressee:profiles!relationships_addressee_id_fkey (
              id,
              username,
              pfp,
              status,
              created_at,
              deleted_at
            )
          `,
          )

          .or(`requester_id.eq.${req.user.id},addressee_id.eq.${req.user.id}`);

        if (error) {
          throw new NotFoundError(error.message || "No relations found");
        }

        let result = relations.map((relation) => {
          const otherUser =
            relation.requester_id === req.user.id
              ? relation.addressee?.[0]
              : relation.requester?.[0];

          if (otherUser?.deleted_at && relation.status === "accepted") {
            return {
              id: relation.id,
              status: "deleted",
              requested_at: relation.requested_at,
              accepted_at: relation.accepted_at,
              other_user: {
                id: otherUser.id,
                username: otherUser.username,
                pfp: otherUser.pfp,
                status: otherUser.status,
                created_at: otherUser.created_at,
                deleted_at: otherUser.deleted_at,
              },
            };
          } else if (otherUser?.deleted_at) return null;
          else {
            return {
              id: relation.id,
              status:
                relation.status === "accepted" &&
                new Date(relation.accepted_at).getTime() >
                  Date.now() - 3 * 24 * 60 * 60 * 1000
                  ? "new"
                  : relation.status,
              requested_at: relation.requested_at,
              accepted_at: relation.accepted_at,
              other_user: {
                id: otherUser?.id,
                username: otherUser?.username,
                pfp: otherUser?.pfp,
                status: otherUser?.status,
                created_at: otherUser?.created_at,
                deleted_at: otherUser?.deleted_at,
              },
            };
          }
        });

        result = result.filter((r) => r !== null);
        res.status(200).json(result);
      },
    },
    {
      method: "post",
      props: "/request/:id/",
      authorization: "required",
      rateLimit: "strict",
      keyType: "user",
      handler: async (req: Request, res: Response) => {
        const id = req.params.id as string;

        if (!id) {
          throw new BadRequestError(
            "Specify a user id to send a friend request.",
          );
        }

        validateID(id);
        const user = await fetchUserWithId(id);

        if(!user) {
          throw new NotFoundError("User not found");
        }

        if (id === req.user.id) {
          throw new BadRequestError(
            "You cannot send a friend request to yourself.",
          );
        }
        const { data: relation } = await supabase
          .from("relationships")
          .select("*")
          .or(
            `and(requester_id.eq.${req.user.id},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${req.user.id})`,
          )
          .maybeSingle();

        if (relation) {
          if (relation.status === "accepted") {
            throw new BadRequestError(
              "You are already friends with this user.",
            );
          } else if (relation.requester_id === req.user.id) {
            throw new BadRequestError(
              "You have already sent a friend request to this user.",
            );
          } else {
            throw new BadRequestError(
              "This user has already sent you a friend request. Accept it in the relations tab.",
            );
          }
        }

        const { data: newRelation, error } = await supabase
          .from("relationships")
          .insert({
            requester_id: req.user.id,
            addressee_id: id,
          });

        if (error) {
          throw new BadRequestError(error.message);
        }

        res.status(201).json(newRelation);
      },
    },
  ],
};

export default relationsRouter;
