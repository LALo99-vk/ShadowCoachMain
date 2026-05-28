import express from "express";
import multer from "multer";

import serviceAi from "../services/ai.service.js";
import prisma from "../config/db.js";
import { use } from "react";

const analyzeSession = async (req, res) => {

    try {

        console.log("hi")

        const file = req.file;

        const { question } = req.body;

        const user = req.user;

        if (!file) {
            return res.status(400).json({
                message: "Image is required"
            });
        }

        console.log(user);

        console.log(file);

        console.log(question);

        const analyzeReport = await serviceAi(
            file.path, question
        )
        
    
        const sessionStoring = await prisma.session.create({

            data : {
            imageUrl : file.path,
            userId : user.userId,
            overallScore : analyzeReport.overallScore,
            strengths : analyzeReport.strengths,
            areasToImprove : analyzeReport.areasToImprove,
            priorityFix : analyzeReport.priorityFix,
            drillSuggestion : analyzeReport.drillSuggestion,
            confidenceLevel : analyzeReport.confidenceLevel,
            aiRawResponse : analyzeReport,
            }
        })
        return res.status(201).json({
   message: "Session created successfully",
   session: sessionStoring
});

    } catch (err) {

        return res.status(500).json({
            error: err.message
        });

    }
}

export default analyzeSession