import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
const PORT = 3000;


import authRouter from "./routes/auth.js"
import sessionRouter from "./routes/session.js";

const app = express()

app.use(cookieParser());


app.use("/api/auth" , authRouter)
app.use("/api/session" , sessionRouter)





app.listen(PORT, (req,res)=> {
console.log("server running on port 3000")

})