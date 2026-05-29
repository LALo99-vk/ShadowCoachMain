import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { getCorsOptions } from "./config/cors.js";
import authRouter from "./routes/auth.js";
import sessionRouter from "./routes/session.js";
import { generalLimiter } from "./middleware/rateLimiter.js";

const app = express();

if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    app.set("trust proxy", 1);
}

app.use(cors(getCorsOptions()));
app.use(generalLimiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/session", sessionRouter);

app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
});

export default app;
