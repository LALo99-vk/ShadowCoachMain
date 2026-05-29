import express from "express";
import { authmiddleware } from "../middleware/auth.middleware.js";
import upload from "../middleware/upload.middleware.js";
import {
    analyzeSession,
    getSession,
    listSessions,
    sessionFollowUp,
    deleteSession,
} from "../controllers/ssn.contoller.js";

const sessionRouter = express.Router();

sessionRouter.use(express.json());

sessionRouter.post( "/analyze",authmiddleware,
    upload.single("image"),
    analyzeSession
);

sessionRouter.get("/", authmiddleware, listSessions);

sessionRouter.get("/:id", authmiddleware, getSession);

sessionRouter.post("/:id", authmiddleware, sessionFollowUp);

sessionRouter.delete("/:id", authmiddleware, deleteSession);

export default sessionRouter;
