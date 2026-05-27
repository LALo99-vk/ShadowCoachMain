import express from "express";
import jwt from "jsonwebtoken";



const JWT_USER_SECRET = process.env.JWT_USER_SECRET


function  authmiddleware (req ,res,next) {

    try{
    const token = req.cookies.token

    if(!token) {
        return res.status(400).json({message : "You are logged out"})
    }

    const decoded = jwt.verify(token , JWT_USER_SECRET)

    if(decoded){
        req.user = decoded
        next()
    }
    else{
        return res.status(403).json({message : "Invalid or expired token"})
    }
}catch(err){
    return res.status(401).json({
            message: "Invalid or expired token" + err.message
        });

}
} 

export {authmiddleware};