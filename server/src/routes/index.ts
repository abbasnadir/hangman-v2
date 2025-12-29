import type { Request, Response } from "express";
import type { RouterObject } from "../../types/router.js";

/* GET home page. */
const indexRouter: RouterObject = {
  path: "/",
  functions: [
    {
      method: "get",
      authorization: "none",
      rateLimit: "strict",
      keyType: "default",
      handler: (_req: Request, res: Response) => {
        res.status(200).json({ message: "Works!" });
      },
    },
  ],
};

export default indexRouter;
