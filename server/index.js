import express from "express";
import cors from "cors";
const PORT = 3000;


import authRouter from "./routes/auth.js"

const app = express()

app.use(cookieParser());

app.use("/api/auth" , authRouter)



app.listen(PORT, (req,res)=> {
console.log("server running on port 3000")

})