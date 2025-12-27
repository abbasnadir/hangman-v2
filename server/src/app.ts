// Type imports

// Library imports
import express, { type Express } from "express";
import path from "path";
import cookieParser from "cookie-parser";
import logger from "morgan";
import cors from "cors";

// Module imports
import { indexRouter } from "./routes/index.js";
import { usersRouter } from "./routes/users.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { __dirname } from "./utils/paths.js";
import { NotFoundError } from "./errors/httpErrors.js";
import { authHandler } from "./middlewares/authHandler.js";
const app: Express = express();

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
app.use(authHandler);

// App routes
app.use("/", indexRouter);
app.use("/users", usersRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  throw new NotFoundError();
});

// error handler
app.use(errorHandler);

export default app;
