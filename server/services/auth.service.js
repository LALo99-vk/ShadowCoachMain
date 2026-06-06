import crypto from "crypto";
import jwt from "jsonwebtoken";
import prisma from "../config/db.js";
import {
    AUTH_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    getAccessCookieOptions,
    getRefreshCookieOptions,
} from "../config/cookies.js";

const JWT_USER_SECRET = process.env.JWT_USER_SECRET;
const ACCESS_TOKEN_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES || "15m";
const REFRESH_TOKEN_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 7);

export const userProfileSelect = {
    id: true,
    fullName: true,
    email: true,
    age: true,
    country: true,
    state: true,
    sport: true,
    role: true,
    level: true,
    createdAt: true,
    updatedAt: true,
};

// hashing refresh token because if db is compromised they can use refresh token directly so we hash the tokens
function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

export function signAccessToken(user) {
    return jwt.sign(
        {
            userId: user.id,
            email: user.email,
            fullName: user.fullName,
        },
        JWT_USER_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRES }
    );
}

export function verifyAccessToken(token) {
    return jwt.verify(token, JWT_USER_SECRET);
}

export async function issueTokenPair(user, res, setCookies) {
    const accessToken = signAccessToken(user);
    const refreshToken = crypto.randomBytes(48).toString("hex");
    const expiresAt = new Date(
        Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000 //creates the expiry date from the date this gets called
    );

    await prisma.refreshToken.create({
        data: {
            tokenHash: hashToken(refreshToken),
            userId: user.id,
            expiresAt,
        },
    });

    if (setCookies) {
        res.cookie(AUTH_COOKIE_NAME, accessToken, getAccessCookieOptions());
        res.cookie(
            REFRESH_COOKIE_NAME,
            refreshToken,
            getRefreshCookieOptions()
        );
    }

    return { accessToken, refreshToken, expiresAt };
}
// after access expire browser calls this function without user knowing
export async function refreshSession(refreshToken) {
    const tokenHash = hashToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({
        where: { tokenHash },
        include: {
            user: { select: userProfileSelect },
        },
    });

    if (!stored || stored.expiresAt < new Date()) { // we dont need expired token so delete
        if (stored) {
            await prisma.refreshToken.delete({ where: { id: stored.id } });
        }
        throw new Error("Invalid or expired refresh token");
    }

    await prisma.refreshToken.delete({ where: { id: stored.id } });

    return stored.user;
}

export async function revokeRefreshToken(refreshToken) {
    if (!refreshToken) return;
    const tokenHash = hashToken(refreshToken);
    await prisma.refreshToken.deleteMany({ where: { tokenHash } });
}

export async function revokeAllUserRefreshTokens(userId) {
    await prisma.refreshToken.deleteMany({ where: { userId } });
}
