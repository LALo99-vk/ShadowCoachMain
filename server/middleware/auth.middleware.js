import { AUTH_COOKIE_NAME } from "../config/cookies.js";
import { verifyAccessToken } from "../services/auth.service.js";

function authmiddleware(req, res, next) {
    try {
        const token = req.cookies[AUTH_COOKIE_NAME];

        if (!token) {
            return res.status(401).json({ message: "You are logged out" });
        }

        const decoded = verifyAccessToken(token);
        req.user = decoded;
        next();
    } catch (err) {
        const expired = err.name === "TokenExpiredError";
        return res.status(401).json({
            message: expired
                ? "Access token expired"
                : "Invalid or expired token",
            code: expired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
        });
    }
}

export { authmiddleware };
