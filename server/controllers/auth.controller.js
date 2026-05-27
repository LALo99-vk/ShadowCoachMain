import express from "express";
import prisma from "../config/db.js";

import bcrypt from 'bcrypt';
import z from "zod";
import jwt from "jsonwebtoken";

const JWT_USER_SECRET = process.env.JWT_USER_SECRET;


const passwordvalidation = z.string()
    .min(8, "passwords must be atleast 8 characters")
    .refine((val) => /[A-Z]/.test(val),{
    message : "must contain uppercase letter"
    })
    .refine((val) => /[a-z]/.test(val), {
    message: "Must contain lowercase letter",
    })
    .refine((val) => /[0-9]/.test(val), {
    message: "Must contain a number",
    })
    .refine((val) => /[!@#$%^&*]/.test(val), {
    message: "Must contain special character",
    }
);


const registerFunction = async (req , res ) => {

    const requestBody = z.object({
        email : z.string().min(3).max(100),
        password : passwordvalidation,
        fullName : z.string().min(3).max(20),
        country : z.string().min(3).max(20),
        state : z.string(),
        age : z.number(),
        sport: z.enum(["CRICKET", "FOOTBALL", "BASKETBALL", "BADMINTON"]),
        level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
        role: z.string()
    })

    const parsedData = requestBody.safeParse(req.body)

     if(!parsedData.success){
        return res.json({
            message : "incorrect format",
            error : parsedData.error
        })
    }

    
    try {

        console.log("Hello from register funciton")
        const {fullName , email , password , age , country , state , sport , role , level} = req.body

        const UserExist = await prisma.user.findUnique({
            where : {email : email}
        })

        if(UserExist){
            return res.status(409).json({message : "user already Register"})
        }

        const hashedPasswords = await bcrypt.hash(password , 10)

        const newUser = await prisma.user.create({
            data : {
            fullName : fullName,
            email : email,
            password : hashedPasswords,
            age : age,
            country : country,
            state : state,
            sport : sport,
            role : role,
            level : level
            }
        })
        if(newUser){
            return res.status(200).json({message : "USER SUCCESFULLY REGISTERED"})
        }
    }catch (err) {

        res.status(403).json({error : err.message})

    }
}

const loginFunction = async (req , res) => {

    try{

        const {email , password} = req.body

        const UserExist = await prisma.user.findUnique({
            where : {
                email : email
            }
        })

        if(!UserExist){
            return res.status(404).json({message : "You are Not registered ,Please Register"})
        }

        const passwordCompare = await bcrypt.compare(password , UserExist.password)

        if(passwordCompare){
            const token = jwt.sign({
                userId : UserExist.id,
                email : UserExist.email,
                fullName : UserExist.fullName
            }, JWT_USER_SECRET , {expiresIn : '7d'})

             res.cookie('token' , token ,{
                httpOnly : true,
                secure : true,
                maxAge: 7 * 24 * 60 * 60 * 1000
            });
            res.status(200).json({message : "login succesfull"})

        }

        else{
            return res.status(403).json({message : "Invalid credentials"})
        }
    }catch(err){
        res.status(403).json({error : err.message})

    }
}

const logoutFunction = async(req,res) => {

    res.clearCookie(token , {
        httpOnly: true,
        secure: true,
    })

    res.status(200).json({message : "logout succefull "})

}


export { registerFunction, loginFunction , logoutFunction };