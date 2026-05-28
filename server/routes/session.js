import express from "express";
import { authmiddleware } from "../middleware/auth.middleware.js";
import upload from "../middleware/upload.middleware.js";
import analyzeSession from "../controllers/ssn.contoller.js";

const sessionRouter = express.Router();

sessionRouter.post("/analyze" ,authmiddleware, upload.single("image") ,analyzeSession
)

sessionRouter.get("/" , (req,res) => {

})

sessionRouter.post("/:id" , (req,res) => {

})

sessionRouter.delete("/" , (req,res) => {

})

export default sessionRouter;

