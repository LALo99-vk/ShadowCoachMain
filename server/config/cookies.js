const isProduction = process.env.NODE_ENV === "production";
const isSameOriginDeploy = Boolean(process.env.VERCEL || process.env.SAME_ORIGIN === "true");

export const AUTH_COOKIE_NAME = "token";
export const REFRESH_COOKIE_NAME = "refreshToken";

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function baseCookieOptions(maxAge) {
    if (isProduction && isSameOriginDeploy) {
        return {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            maxAge,
        };
    }

    if (isProduction) {
        return {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge,
        };
    }

    const crossOriginDev = Boolean(process.env.CLIENT_URL?.trim());
    if (crossOriginDev) {
        return {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge,
        };
    }

    return {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge,
    };
}

export function getAccessCookieOptions() {
    return baseCookieOptions(ACCESS_MAX_AGE_MS);
}

export function getRefreshCookieOptions() {
    return baseCookieOptions(REFRESH_MAX_AGE_MS);
}

/** @deprecated use getAccessCookieOptions */
export function getAuthCookieOptions() {
    return getAccessCookieOptions();
}
