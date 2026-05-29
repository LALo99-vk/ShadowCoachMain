import app from "./app.js";
import { getAllowedOrigins } from "./config/cors.js";

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT);

server.on("listening", () => {
    const mode = process.env.NODE_ENV || "development";
    console.log(`Server running on port ${PORT} (${mode})`);
    console.log(`CORS allowed origins: ${getAllowedOrigins().join(", ")}`);
    if (mode === "development") {
        console.log("CORS dev mode: any localhost / 127.0.0.1 port is allowed");
    }
});

server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        console.error(`\nPort ${PORT} is already in use. Stop the other server first:`);
        console.error(`  lsof -ti:${PORT} | xargs kill -9`);
        console.error(`Then run: node index.js\n`);
        process.exit(1);
    }
    console.error("Server failed to start:", err);
    process.exit(1);
});
