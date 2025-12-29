// Check if all the environment variables are set
import "./lib/env.js";

// Type imports

// Library imports
import express, { type Express } from "express";
import path from "path";
import cookieParser from "cookie-parser";
import logger from "morgan";
import cors from "cors";

// Module imports
import { routesHandler } from "./lib/routeHandler.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { NotFoundError } from "./errors/httpErrors.js";
const app: Express = express();
const __dirname = import.meta.dirname;

// External Middlewares
app.use(logger("dev"));
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.PROD_URL
        : "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Register App routes
const apiRouter = await routesHandler();
app.use(apiRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  throw new NotFoundError();
});

// error handler
app.use(errorHandler);

export default app;
