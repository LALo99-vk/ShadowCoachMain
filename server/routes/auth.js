import express from "express"
import cookieParser from "cookie-parser";



import { loginFunction , registerFunction , logoutFunction } from "../controllers/auth.controller.js";
import { authmiddleware } from "../middleware/auth.middleware.js";

const authRouter = express.Router()

authRouter.use(express.json());
authRouter.use(cookieParser());

authRouter.post("/register" , registerFunction)

authRouter.post("/login" , loginFunction)

authRouter.post("/logout" , logoutFunction)

authRouter.post("/me" , authmiddleware,( req,res) => {
  const userDetails = req.user

  res.json({message : userDetails})
})



export default authRouter