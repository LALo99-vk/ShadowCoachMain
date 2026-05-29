import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { getCorsOptions } from "./config/cors.js";
import authRouter from "./routes/auth.js";
import sessionRouter from "./routes/session.js";
import { generalLimiter } from "./middleware/rateLimiter.js";
import prisma from "./config/db.js";

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

app.get("/api/health", async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ ok: true, db: true });
    } catch (err) {
        res.status(503).json({
            ok: false,
            db: false,
            error: err.message,
        });
    }
});

app.use((err, _req, res, _next) => {
    console.error("API error:", err);
    res.status(500).json({
        error: err.message || "Internal server error",
    });
});

export default app;
