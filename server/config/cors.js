const defaultOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
];

export function getCorsOptions() {
    const fromEnv = process.env.CLIENT_URL?.split(",").map((o) => o.trim()).filter(Boolean);
    const origin = fromEnv?.length ? fromEnv : defaultOrigins;

    return {
        origin,
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    };
}
