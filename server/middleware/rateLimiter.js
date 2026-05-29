import { rateLimit } from "express-rate-limit";

const skipPreflight = (req) => req.method === "OPTIONS";

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: { error: "Too many login attempts , try again in 15mins thank you " },
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: skipPreflight,
});

const sessionCreationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    message: { error: "Analysis limit reached. You can create 5 sessions per hour." },
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: skipPreflight,
});

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    message: { error: "Too many requests. Slow down." },
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: skipPreflight,
});

export { authLimiter, sessionCreationLimiter, generalLimiter };
