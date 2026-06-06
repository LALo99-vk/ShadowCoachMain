import express from "express";
import { authmiddleware } from "../middleware/auth.middleware.js";
import upload, { handleUploadError } from "../middleware/upload.middleware.js";
import {
    analyzeSession,
    getSession,
    getSessionReport,
    listReports,
    listSessions,
    sessionFollowUp,
    deleteSession,
    streamSessionReportFile,
} from "../controllers/ssn.contoller.js";

import { sessionCreationLimiter } from "../middleware/rateLimiter.js";

const sessionRouter = express.Router();

sessionRouter.use(express.json());

sessionRouter.post(
    "/analyze",
    authmiddleware,
    sessionCreationLimiter,
    upload.single("image"),
    handleUploadError,
    analyzeSession
);

sessionRouter.get("/", authmiddleware, listSessions);

sessionRouter.get("/reports", authmiddleware, listReports);

sessionRouter.get("/:id/report/file", authmiddleware, streamSessionReportFile);

sessionRouter.get("/:id/report", authmiddleware, getSessionReport);

sessionRouter.get("/:id", authmiddleware, getSession);

sessionRouter.post("/:id", authmiddleware, sessionFollowUp);

sessionRouter.delete("/:id", authmiddleware, deleteSession);

export default sessionRouter;
