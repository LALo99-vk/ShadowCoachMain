import express from "express";

const sessionRouter = express.Router();

sessionRouter.get("/analyze" , (req,res) => {

    res.status(200).json({message : "HI from session"})

})

export default sessionRouter;

