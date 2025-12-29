import type { Request, Response } from "express";
import type { RouterObject } from "../../types/router.js";

/* GET home page. */
const meRouter: RouterObject = {
  path: "/me",
  functions: [
    {
      method: "get",
      authorization: "required",
      rateLimit: "strict",
      keyType: "default",
      handler: (req: Request, res: Response) => {
        res.status(200).json({
          id: req.user.id,
          email: req.user.email,
          role: req.user.role,
        });
      },
    },
  ],
};

export default meRouter;
