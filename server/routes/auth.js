import express from "express";
import cookieParser from "cookie-parser";
import {
    loginFunction,
    registerFunction,
    logoutFunction,
    refreshTokenFunction,
    getMeFunction,
} from "../controllers/auth.controller.js";
import { authmiddleware } from "../middleware/auth.middleware.js";

import { authLimiter } from "../middleware/rateLimiter.js";

const authRouter = express.Router();

authRouter.use(express.json());
authRouter.use(cookieParser());

authRouter.post("/register", authLimiter, registerFunction);

authRouter.post("/login",authLimiter, loginFunction);

authRouter.post("/logout", logoutFunction);

authRouter.post("/refresh", refreshTokenFunction);


authRouter.get("/me", authmiddleware, getMeFunction);

authRouter.post("/me", authmiddleware, getMeFunction);

export default authRouter;
