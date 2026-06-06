import prisma from "../config/db.js";
import bcrypt from "bcryptjs";
import z from "zod";
import {
    AUTH_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    getAccessCookieOptions,
    getRefreshCookieOptions,
} from "../config/cookies.js";
import {
    issueTokenPair,
    refreshSession,
    revokeRefreshToken,
    userProfileSelect,
} from "../services/auth.service.js";

const passwordvalidation = z
    .string()
    .min(8, "passwords must be atleast 8 characters")
    .refine((val) => /[A-Z]/.test(val), {
        message: "must contain uppercase letter",
    })
    .refine((val) => /[a-z]/.test(val), {
        message: "Must contain lowercase letter",
    })
    .refine((val) => /[0-9]/.test(val), {
        message: "Must contain a number",
    })
    .refine((val) => /[!@#$%^&*]/.test(val), {
        message: "Must contain special character",
    });

const registerSchema = z.object({
    email: z.string().email().max(100),
    password: passwordvalidation,
    fullName: z.string().min(3).max(20),
    country: z.string().min(3).max(20),
    state: z.string().min(1),
    age: z.number().int().min(1).max(120),
    sport: z.enum(["CRICKET", "FOOTBALL", "BASKETBALL", "BADMINTON"]),
    level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
    role: z.string().min(1).max(50),
});

const loginSchema = z.object({
    email: z.string().email("Valid email is required"),
    password: z.string().min(1, "Password is required"),
});

const registerFunction = async (req, res) => {
    const parsedData = registerSchema.safeParse(req.body);

    if (!parsedData.success) {
        return res.status(400).json({
            message: "incorrect format",
            error: parsedData.error.flatten(),
        });
    }

    try {
        const { fullName, email, password, age, country, state, sport, role, level } =
            parsedData.data;

        const emailNormalized = email.toLowerCase().trim();

        const userExist = await prisma.user.findUnique({
            where: { email: emailNormalized },
        });

        if (userExist) {
            return res.status(409).json({ message: "user already Register" });
        }

        await prisma.user.create({
            data: {
                fullName,
                email: emailNormalized,
                password: await bcrypt.hash(password, 10),
                age,
                country,
                state,
                sport,
                role,
                level,
            },
        });

        return res.status(201).json({ message: "USER SUCCESFULLY REGISTERED" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const loginFunction = async (req, res) => {
    //i used safe parse because it wont throw error and server wont crash instead returns.  {success:false,error:{...}}
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({
            message: "incorrect format",
            error: parsed.error.flatten(), // used to structure the error message
        });
    }

    try {
        const { email, password } = parsed.data;
        const emailNormalized = email.toLowerCase().trim();

        const user = await prisma.user.findUnique({
            where: { email: emailNormalized },
            select: { ...userProfileSelect, password: true }, 
        });

        if (!user) {
            return res.status(404).json({
                message: "You are Not registered ,Please Register",
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(403).json({ message: "Invalid credentials" });
        }

        const { password: _, ...profile } = user;  // used object destrucuting here leaving out password 
        await issueTokenPair(profile, res, true);

        return res.status(200).json({
            message: "login succesfull",
            user: profile,
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const logoutFunction = async (req, res) => {
    
    await revokeRefreshToken(req.cookies[REFRESH_COOKIE_NAME]);
    res.clearCookie(AUTH_COOKIE_NAME, getAccessCookieOptions());
    res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions()); //browser matches cooking using thir attributes so we call getaccess
    return res.status(200).json({ message: "Logout successful" });
};

// browser comes here when need access tokens after expiry
const refreshTokenFunction = async (req, res) => {
    const refreshToken = req.cookies[REFRESH_COOKIE_NAME];

    if (!refreshToken) {
        return res.status(401).json({ message: "Refresh token missing" });
    }

    try {
        const user = await refreshSession(refreshToken);
        await issueTokenPair(user, res, true);
        return res.status(200).json({ message: "Token refreshed", user });
    } catch (err) {
        res.clearCookie(AUTH_COOKIE_NAME, getAccessCookieOptions());
        res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions());
        return res.status(401).json({
            message: "Invalid or expired refresh token",
        });
    }
};

const getMeFunction = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: userProfileSelect,
        });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.json({ user });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

export {
    registerFunction,
    loginFunction,
    logoutFunction,
    refreshTokenFunction,
    getMeFunction,
};
