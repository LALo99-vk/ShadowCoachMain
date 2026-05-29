import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { getCorsOptions } from "./config/cors.js";

const PORT = process.env.PORT || 3000;

import authRouter from "./routes/auth.js";
import sessionRouter from "./routes/session.js";

const app = express();

if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

app.use(cors(getCorsOptions()));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/session", sessionRouter);





app.listen(PORT, () => {
    const mode = process.env.NODE_ENV || "development";
    console.log(`Server running on port ${PORT} (${mode})`);
});