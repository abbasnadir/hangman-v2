import type { Request, Response } from "express";
import type { RouterObject } from "../../types/router.js";
import { supabase } from "../lib/supabaseClient.js";
import { BadRequestError, NotFoundError } from "../errors/httpErrors.js";
import { z } from "zod";

import { fetchUserWithId } from "../utils/dbQueries.js";
import { idSchema } from "../schemas/common.schemas.js";

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
        // From supabase select all relations where the user is either the requester or the addressee, and include the other user's profile data.
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

        // Error here likely means the user has no relations
        if (error) {
          throw new NotFoundError("No relations found");
        }

        // Map the relations to include the other user's data and filter out deleted users and relations.
        let result = relations.map((relation) => {
          const otherUser =
            relation.requester_id === req.user.id
              ? relation.addressee?.[0]
              : relation.requester?.[0];

          // status variable to keep track of user status
          let status = relation.status;

          // If the other user is deleted but the relation already existed, mark the relation as deleted
          if (otherUser?.deleted_at && relation.status === "accepted") {
            status = "deleted";
          }

          //If the other user is deleted and the relation is not accepted, no need to show the relation at all
          else if (otherUser?.deleted_at || !otherUser) return null;
          // If the relation is accepted and was accepted within the last 3 days, mark it as new
          else {
            status =
              relation.status === "accepted" &&
              new Date(relation.accepted_at).getTime() >
                Date.now() - 3 * 24 * 60 * 60 * 1000
                ? "new"
                : relation.status;
          }
          return {
            id: relation.id,
            status: status,
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
      zodSchema: z.object({ params: idSchema }),
      handler: async (req: Request, res: Response) => {
        const id: string = res.locals.params.id;

        const user = await fetchUserWithId(id);

        if (!user) {
          throw new NotFoundError("User not found");
        }

        // Prevent self friend requests
        if (id === req.user.id) {
          throw new BadRequestError(
            "You cannot send a friend request to yourself.",
          );
        }

        const { data: relation, error: relationError } = await supabase
          .from("relationships")
          .select("*")
          .or(
            `and(requester_id.eq.${req.user.id},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${req.user.id})`,
          )
          .maybeSingle();

        if (relationError) {
          throw new BadRequestError(relationError.message);
        }

        if (relation) {
          if (relation.status === "accepted") {
            throw new BadRequestError(
              "You are already friends with this user.",
            );
          } else if (relation.status === "pending") {
            if (relation.requester_id === req.user.id) {
              throw new BadRequestError(
                "You have already sent a friend request to this user.",
              );
            } else {
              throw new BadRequestError(
                "This user has already sent you a friend request. Accept it in the relations tab.",
              );
            }
          } else if (relation.status === "rejected") {
            // If the previous request was rejected, we can allow sending another request after some time
            const rejectedAt = new Date(relation.requested_at).getTime();
            if (
              relation.requester_id === req.user.id &&
              Date.now() - rejectedAt < 5 * 60 * 1000
            ) {
              throw new BadRequestError(
                "You can only send another friend request to this user after 5 minutes of rejection.",
              );
            } else {
              const { data: newRelation, error } = await supabase
                .from("relationships")
                .update({
                  status: "pending",
                  requested_at: new Date().toISOString(),
                  requester_id: req.user.id,
                  addressee_id: id,
                  accepted_at: null,
                })
                .eq("id", relation.id)
                .select("*")
                .single();

              if (error || !newRelation) {
                throw new BadRequestError("Failed to send friend request.");
              }

              res.status(200).json(newRelation);
              return;
            }
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
    {
      method: "delete",
      props: "/request/:id/",
      authorization: "required",
      rateLimit: "strict",
      keyType: "user",
      zodSchema: z.object({ params: idSchema }),
      handler: async (req: Request, res: Response) => {
        const id: string = res.locals.params.id;

        const { data: relation, error } = await supabase
          .from("relationships")
          .select("*")
          .or(
            `and(requester_id.eq.${req.user.id},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${req.user.id})`,
          )
          .maybeSingle();

        if (error || !relation) {
          throw new NotFoundError(
            "No friend request found between you and this user.",
          );
        }
        if (
          relation.status === "pending" &&
          relation.requester_id !== req.user.id
        ) {
          const { data, error: updateError } = await supabase
            .from("relationships")
            .update({
              status: "rejected",
              accepted_at: null,
            })
            .eq("id", relation.id)
            .select("*")
            .single();

          if (updateError || !data) {
            throw new BadRequestError("Failed to reject friend request.");
          }
          res.status(200).json(data);
          return;
        }
        const { error: fetchError } = await supabase
          .from("relationships")
          .delete()
          .eq("id", relation.id);
        if (fetchError) {
          throw new BadRequestError(fetchError.message);
        }
        res.sendStatus(204);
      },
    },
    {
      method: "patch",
      props: "/respond/:id/",
      authorization: "required",
      rateLimit: "strict",
      keyType: "user",
      zodSchema: z.object({ params: idSchema }),
      handler: async (req: Request, res: Response) => {
        const id: string = res.locals.params.id;

        const { data: relation, error } = await supabase
          .from("relationships")
          .select("*")
          .eq("requester_id", id)
          .eq("addressee_id", req.user.id)
          .maybeSingle();

        if (error || !relation) {
          throw new NotFoundError("No friend request found from this user.");
        }

        if (relation.status !== "pending") {
          throw new BadRequestError(
            "This friend request has already been responded to.",
          );
        }

        const { data, error: updateError } = await supabase
          .from("relationships")
          .update({
            status: "accepted",
            accepted_at: new Date().toISOString(),
          })
          .eq("id", relation.id)
          .select("*")
          .single();

        if (updateError || !data) {
          throw new BadRequestError("Failed to respond to friend request.");
        }

        res.status(200).json(data);
      },
    },
  ],
};

export default relationsRouter;
