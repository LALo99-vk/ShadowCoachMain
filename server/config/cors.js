const defaultOrigins = [
    "http://localhost:5173",
    "http://localhost:8080",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8080",
];

const isDev = process.env.NODE_ENV !== "production";

export function getAllowedOrigins() {
    const fromEnv = process.env.CLIENT_URL?.split(",")
        .map((o) => o.trim())
        .filter(Boolean);

    const vercelOrigin = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : null;
    // remove duplicate urls 
    return [...new Set([...(fromEnv ?? []), ...(vercelOrigin ? [vercelOrigin] : []), ...defaultOrigins])];
}

export function getCorsOptions() {
    const base = {
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        optionsSuccessStatus: 204,
    };

    // Dev: reflect any request origin (localhost:8080, :5173, etc.)
    if (isDev) {
        return { ...base, origin: true };
    }

    const allowedOrigins = getAllowedOrigins();
    return {
        ...base,
        origin(origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error(`Not allowed by CORS: ${origin}`));
            }
        },
    };
}
