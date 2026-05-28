import fs from "fs";
import path from "path";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { z } from "zod";
import "dotenv/config";

const AI_PROVIDER = (process.env.AI_PROVIDER || "gemini").toLowerCase();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const XAI_API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
const GROK_MODEL = process.env.GROK_MODEL || "grok-2-vision-1212";

// 1.5 models return 404 on current API — use 2.5 / 2.0 only
const DEFAULT_GEMINI_FALLBACKS = [
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash-lite",
];

function geminiModelChain() {
    const fromEnv = [
        process.env.GEMINI_MODEL,
        ...(process.env.GEMINI_FALLBACK_MODELS?.split(",") || []),
        ...DEFAULT_GEMINI_FALLBACKS,
    ]
        .map((m) => m?.trim())
        .filter(Boolean);
    return [...new Set(fromEnv)];
}

const coachingResponseSchema = z.object({
    overallScore: z.number().int().min(0).max(100),
    strengths: z.array(z.string()).min(1),
    areasToImprove: z.array(z.string()).min(1),
    priorityFix: z.string().min(1),
    drillSuggestion: z.string().min(1),
    confidenceLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
});

const COACHING_JSON_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        overallScore: {
            type: SchemaType.INTEGER,
            description: "Overall technique score from 0 to 100",
        },
        strengths: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
        },
        areasToImprove: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
        },
        priorityFix: { type: SchemaType.STRING },
        drillSuggestion: { type: SchemaType.STRING },
        confidenceLevel: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["LOW", "MEDIUM", "HIGH"],
        },
    },
    required: [
        "overallScore",
        "strengths",
        "areasToImprove",
        "priorityFix",
        "drillSuggestion",
        "confidenceLevel",
    ],
};

const JSON_OUTPUT_INSTRUCTION = `
Respond with a single JSON object only (no markdown), with exactly these keys:
overallScore (integer 0-100),
strengths (array of strings, at least 2),
areasToImprove (array of strings, at least 2),
priorityFix (string),
drillSuggestion (string),
confidenceLevel ("LOW" | "MEDIUM" | "HIGH").`;

function getGenAI() {
    if (!GEMINI_API_KEY) {
        throw new Error(
            "GEMINI_API_KEY is not configured. Add it to server/.env or set AI_PROVIDER=grok with XAI_API_KEY."
        );
    }
    return new GoogleGenerativeAI(GEMINI_API_KEY);
}

function mimeTypeFromPath(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    };
    return map[ext] || "image/jpeg";
}

function readImageBase64(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Image file not found: ${filePath}`);
    }
    return fs.readFileSync(filePath).toString("base64");
}

function fileToGenerativePart(filePath) {
    return {
        inlineData: {
            data: readImageBase64(filePath),
            mimeType: mimeTypeFromPath(filePath),
        },
    };
}

function imageDataUrl(filePath) {
    const mime = mimeTypeFromPath(filePath);
    return `data:${mime};base64,${readImageBase64(filePath)}`;
}

function buildCoachSystemInstruction(athleteProfile = {}) {
    const { sport, level, role, fullName } = athleteProfile;
    const athleteLine = [
        sport && `Sport: ${sport}`,
        role && `Role/position: ${role}`,
        level && `Experience: ${level}`,
        fullName && `Athlete: ${fullName}`,
    ]
        .filter(Boolean)
        .join(". ");

    return `You are ShadowCoach, an expert AI sports coach for amateur and competitive athletes.

Your job is to analyze sports stance, posture, and technique from a single photo and give honest, encouraging, actionable coaching.

Guidelines:
- Base feedback only on what is visible in the image. If the angle, lighting, or crop limits your view, lower confidenceLevel and say what you cannot assess.
- Tailor language and drills to the athlete's sport and experience level when provided.
- Be specific (body parts, angles, weight distribution, grip, foot placement) rather than generic praise.
- overallScore reflects visible technique for this snapshot, not the athlete's long-term potential.
- strengths and areasToImprove must each contain at least two distinct bullet-style observations.
- priorityFix is one clear, prioritized correction.
- drillSuggestion is one practical drill they can do without special equipment when possible.
- confidenceLevel must be exactly LOW, MEDIUM, or HIGH.

${athleteLine ? `Athlete context: ${athleteLine}.` : "No athlete profile was provided; infer the sport from the image when possible."}`;
}

function parseCoachingJson(rawText) {
    let parsed;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (!match) {
            throw new Error("AI returned invalid JSON for coaching analysis");
        }
        parsed = JSON.parse(match[0]);
    }

    const result = coachingResponseSchema.safeParse(parsed);
    if (!result.success) {
        throw new Error(
            `AI response did not match expected coaching format: ${result.error.message}`
        );
    }
    return result.data;
}

function isGeminiRetryableError(err) {
    const msg = String(err?.message || err || "");
    return (
        msg.includes("429") ||
        msg.includes("404") ||
        msg.includes("not found") ||
        msg.includes("is not supported") ||
        msg.includes("quota") ||
        msg.includes("Quota exceeded") ||
        msg.includes("RESOURCE_EXHAUSTED")
    );
}

async function geminiGenerate({ modelName, systemInstruction, parts, jsonMode }) {
    const genAI = getGenAI();
    const config = jsonMode
        ? {
              temperature: 0.4,
              responseMimeType: "application/json",
              responseSchema: COACHING_JSON_SCHEMA,
          }
        : { temperature: 0.6 };

    const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction,
        generationConfig: config,
    });

    const result = await model.generateContent(parts);
    const text = result.response.text();
    if (!text?.trim()) {
        throw new Error("Empty response from Gemini");
    }
    return text;
}

async function geminiWithModelFallback({ systemInstruction, parts, jsonMode }) {
    const models = geminiModelChain();
    let lastError;

    for (const modelName of models) {
        try {
            const text = await geminiGenerate({
                modelName,
                systemInstruction: jsonMode
                    ? `${systemInstruction}\n\n${JSON_OUTPUT_INSTRUCTION}`
                    : systemInstruction,
                parts,
                jsonMode,
            });
            if (modelName !== models[0]) {
                console.warn(`Gemini succeeded with fallback model: ${modelName}`);
            }
            return text;
        } catch (err) {
            lastError = err;
            if (isGeminiRetryableError(err)) {
                console.warn(`Gemini failed on ${modelName}, trying next model...`);
                continue;
            }
            throw err;
        }
    }

    throw new Error(
        `All Gemini models failed. Tried: ${models.join(", ")}. ` +
            `Use Grok: set AI_PROVIDER=grok and XAI_API_KEY in .env (https://console.x.ai). ` +
            `Or enable Gemini billing at https://ai.google.dev. ` +
            `Last error: ${lastError?.message || lastError}`
    );
}

async function grokChat({ systemInstruction, userText, imagePath, jsonMode }) {
    if (!XAI_API_KEY) {
        throw new Error(
            "XAI_API_KEY (or GROK_API_KEY) is not configured. Get a key at https://console.x.ai"
        );
    }

    const userContent = [{ type: "text", text: userText }];
    if (imagePath) {
        userContent.push({
            type: "image_url",
            image_url: { url: imageDataUrl(imagePath), detail: "high" },
        });
    }

    const body = {
        model: GROK_MODEL,
        messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userContent },
        ],
        temperature: jsonMode ? 0.4 : 0.6,
    };

    if (jsonMode) {
        body.response_format = { type: "json_object" };
    }

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
        const detail =
            data?.error?.message || JSON.stringify(data?.error || data);
        throw new Error(`Grok API error (${response.status}): ${detail}`);
    }

    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
        throw new Error("Empty response from Grok");
    }
    return text;
}

async function generateCoachingText({
    systemInstruction,
    userText,
    imagePath,
    jsonMode,
}) {
    const parts = imagePath
        ? [{ text: userText }, fileToGenerativePart(imagePath)]
        : [{ text: userText }];

    if (AI_PROVIDER === "grok") {
        return grokChat({
            systemInstruction: jsonMode
                ? `${systemInstruction}\n\n${JSON_OUTPUT_INSTRUCTION}`
                : systemInstruction,
            userText,
            imagePath,
            jsonMode,
        });
    }

    if (AI_PROVIDER === "gemini") {
        return geminiWithModelFallback({ systemInstruction, parts, jsonMode });
    }

    throw new Error(`Unknown AI_PROVIDER "${AI_PROVIDER}". Use "gemini" or "grok".`);
}

export async function analyzeStance(imagePath, question, athleteProfile = {}) {
    const systemInstruction = buildCoachSystemInstruction(athleteProfile);

    const userPrompt = question?.trim()
        ? `The athlete asks: "${question.trim()}"

Analyze the uploaded stance/posture image and answer their question as part of your coaching feedback.`
        : `Analyze the uploaded sports stance or posture image and provide a full coaching assessment.`;

    const text = await generateCoachingText({
        systemInstruction,
        userText: userPrompt,
        imagePath,
        jsonMode: true,
    });

    return parseCoachingJson(text);
}

export async function sendSessionFollowUp({
    imagePath,
    athleteProfile = {},
    sessionAnalysis,
    chatHistory = [],
    userMessage,
}) {
    const systemInstruction = `${buildCoachSystemInstruction(athleteProfile)}

You are continuing a coaching session. The initial structured analysis is below. Answer follow-up questions in clear, conversational coaching tone (2–4 short paragraphs max). Reference the original image and prior analysis when helpful. Do not output JSON for follow-ups.`;

    const historyBlock =
        chatHistory.length > 0
            ? chatHistory
                  .map(
                      (m) =>
                          `${m.role === "USER" ? "Athlete" : "Coach"}: ${m.message}`
                  )
                  .join("\n")
            : "(no prior messages)";

    const analysisBlock = sessionAnalysis
        ? `Initial analysis — score: ${sessionAnalysis.overallScore}/100, priority fix: ${sessionAnalysis.priorityFix}, drills: ${sessionAnalysis.drillSuggestion}, strengths: ${JSON.stringify(sessionAnalysis.strengths)}, improve: ${JSON.stringify(sessionAnalysis.areasToImprove)}`
        : "";

    const userText = `Prior chat:\n${historyBlock}\n\n${analysisBlock}\n\nAthlete follow-up: ${userMessage}`;

    return generateCoachingText({
        systemInstruction,
        userText,
        imagePath,
        jsonMode: false,
    });
}

export default analyzeStance;
