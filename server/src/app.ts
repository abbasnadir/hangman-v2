// Type imports
import type { ResponseError } from "../types/response-error.js";
// Library imports
import createHttpError from "http-errors";
import express, { type Express } from "express";
import path from "path";
import cookieParser from "cookie-parser";
import logger from "morgan";
import cors from "cors";

// Module imports
import { router as indexRouter } from "./routes/index.js";
import { router as usersRouter } from "./routes/users.js";
import { errorHandler } from "./middlewares/errorHandler.js";

const app: Express = express();

// External Middlewares
app.use(logger("dev"));
app.use(cors({ origin: "http://localhost/5000", credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

//App routes
app.use("/", indexRouter);
app.use("/users", usersRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createHttpError(404));
});

// error handler
app.use(errorHandler);

export default app;
