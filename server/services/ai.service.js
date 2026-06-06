import fs from "fs";
import path from "path";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { z } from "zod";
import "dotenv/config";

const AI_PROVIDER = (process.env.AI_PROVIDER || "gemini").toLowerCase();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const XAI_API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
const GROK_MODEL = process.env.GROK_MODEL || "grok-2-vision-1212";

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

export class ImageValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ImageValidationError";
        this.statusCode = 400;
    }
}

const imageValidationSchema = z.object({
    isValidImage: z.boolean(),
    isSportsRelated: z.boolean(),
    hasAnalyzableStance: z.boolean(),
    detectedContent: z.string().min(1),
    rejectionReason: z.string().nullable(),
});

const IMAGE_VALIDATION_JSON_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        isValidImage: {
            type: SchemaType.BOOLEAN,
            description: "True if this is a real, viewable photograph or image",
        },
        isSportsRelated: {
            type: SchemaType.BOOLEAN,
            description:
                "True if the image shows sports, athletics, training, or athletic technique context",
        },
        hasAnalyzableStance: {
            type: SchemaType.BOOLEAN,
            description:
                "True if a human body posture, stance, or athletic movement is visible enough to coach",
        },
        detectedContent: {
            type: SchemaType.STRING,
            description: "Brief description of what is in the image",
        },
        rejectionReason: {
            type: SchemaType.STRING,
            description:
                "Why the image was rejected, or null if acceptable for coaching analysis",
        },
    },
    required: [
        "isValidImage",
        "isSportsRelated",
        "hasAnalyzableStance",
        "detectedContent",
        "rejectionReason",
    ],
};

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

function isRemoteImage(source) {
    return /^https?:\/\//i.test(source);
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

async function fetchRemoteImage(imageUrl) {
    const response = await fetch(imageUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch image from URL (${response.status})`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType =
        response.headers.get("content-type")?.split(";")[0]?.trim() ||
        mimeTypeFromPath(new URL(imageUrl).pathname);
    return { buffer, mimeType };
}

function fileToGenerativePart(filePath) {
    return {
        inlineData: {
            data: readImageBase64(filePath),
            mimeType: mimeTypeFromPath(filePath),
        },
    };
}

async function imageToGenerativePart(imageSource) {
    if (isRemoteImage(imageSource)) {
        const { buffer, mimeType } = await fetchRemoteImage(imageSource);
        return {
            inlineData: {
                data: buffer.toString("base64"),
                mimeType,
            },
        };
    }
    return fileToGenerativePart(imageSource);
}

async function imageUrlForGrok(imageSource) {
    if (isRemoteImage(imageSource)) {
        return imageSource;
    }
    const mime = mimeTypeFromPath(imageSource);
    return `data:${mime};base64,${readImageBase64(imageSource)}`;
}
//athletes profile details get injected here for AI to get context of users
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

Strict scope:
- Only analyze images that show a person in a sports stance, athletic posture, training movement, or competition context.
- If the image is not sports-related (food, objects, landscapes, memes, pets, random scenes), do NOT invent coaching feedback.

Guidelines:
- Base feedback only on what is visible in the image. If the angle, lighting, or crop limits your view, lower confidenceLevel and say what you cannot assess.
- Tailor language and drills to the athlete's sport and experience level when provided.
- Be specific (body parts, angles, weight distribution, grip, foot placement, knee bend, hip hinge, shoulder alignment) rather than generic praise.
- Compare visible form against fundamentals for the detected sport/role when possible.
- overallScore reflects visible technique for this snapshot, not the athlete's long-term potential.
- strengths and areasToImprove must each contain at least two distinct, image-specific observations (not generic platitudes).
- priorityFix is one clear, prioritized correction tied to what you can see.
- drillSuggestion is one practical drill they can do without special equipment when possible.
- confidenceLevel must be exactly LOW, MEDIUM, or HIGH.

${athleteLine ? `Athlete context: ${athleteLine}. Prioritize feedback for this sport and role.` : "No athlete profile was provided; infer the sport from the image when possible."}`;
}

function buildImageValidationInstruction(athleteProfile = {}) {
    const sportHint = athleteProfile.sport
        ? `The athlete's registered sport is ${athleteProfile.sport}. Prefer images that match or clearly relate to athletic training.`
        : "No sport was provided on the profile.";

    return `You are the upload gatekeeper for ShadowCoach, a sports stance analysis app.

Decide whether this image is acceptable BEFORE any coaching analysis runs.

ACCEPT only when ALL are true:
- isValidImage: real photograph or clear sports image (not corrupt, blank, or unreadable)
- isSportsRelated: shows sports, athletics, gym training, practice, or competition — not random everyday objects
- hasAnalyzableStance: a human body posture, stance, swing, throw, jump, or athletic movement is visible enough to coach

REJECT examples (set the matching flags to false):
- Food, fruits, groceries, kitchen items
- Landscapes, buildings, vehicles, furniture, screenshots, documents
- Memes, cartoons, logos, text-only images
- Pets or animals (unless clear equestrian sport with rider)
- Sports equipment alone with no person and no stance to analyze
- Crowd-only or jersey-only shots with no visible technique

${sportHint}

Respond with JSON only. If rejecting, write a helpful rejectionReason telling the user to upload a clear sports stance photo.`;
}

function parseImageValidationJson(rawText) {
    let parsed;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (!match) {
            throw new ImageValidationError(
                "Could not verify image content. Please upload a clear sports stance photo."
            );
        }
        parsed = JSON.parse(match[0]);
    }

    const result = imageValidationSchema.safeParse(parsed);
    if (!result.success) {
        throw new ImageValidationError(
            "Could not verify image content. Please upload a clear sports stance photo."
        );
    }
    return result.data;
}

async function validateSportsImage(imagePath, athleteProfile = {}) {
    const systemInstruction = buildImageValidationInstruction(athleteProfile);
    const userText =
        "Classify this upload for a sports coaching app. Is it a valid sports stance or athletic technique image suitable for analysis?";

    const text = await generateCoachingText({
        systemInstruction: `${systemInstruction}

Respond with a single JSON object only (no markdown) with keys:
isValidImage (boolean),
isSportsRelated (boolean),
hasAnalyzableStance (boolean),
detectedContent (string),
rejectionReason (string or null).`,
        userText,
        imagePath,
        jsonMode: true,
        responseSchema: IMAGE_VALIDATION_JSON_SCHEMA,
        temperature: 0.1,
    });

    const validation = parseImageValidationJson(text);

    if (
        !validation.isValidImage ||
        !validation.isSportsRelated ||
        !validation.hasAnalyzableStance
    ) {
        const reason =
            validation.rejectionReason?.trim() ||
            `This image appears to show "${validation.detectedContent}", which is not a sports stance photo. Upload a clear photo of yourself in an athletic stance or movement.`;
        throw new ImageValidationError(reason);
    }

    return validation;
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

async function geminiGenerate({
    modelName,
    systemInstruction,
    parts,
    jsonMode,
    responseSchema,
    temperature,
}) {
    const genAI = getGenAI();
    const config = jsonMode
        ? {
              temperature: temperature ?? 0.4,
              responseMimeType: "application/json",
              responseSchema: responseSchema ?? COACHING_JSON_SCHEMA,
          }
        : { temperature: temperature ?? 0.6 };

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

async function geminiWithModelFallback({
    systemInstruction,
    parts,
    jsonMode,
    responseSchema,
    temperature,
    jsonOutputInstruction,
}) {
    const models = geminiModelChain();
    let lastError;

    for (const modelName of models) {
        try {
            const text = await geminiGenerate({
                modelName,
                systemInstruction: jsonMode
                    ? `${systemInstruction}\n\n${jsonOutputInstruction ?? JSON_OUTPUT_INSTRUCTION}`
                    : systemInstruction,
                parts,
                jsonMode,
                responseSchema,
                temperature,
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

async function grokChat({
    systemInstruction,
    userText,
    imagePath,
    jsonMode,
    temperature,
}) {
    if (!XAI_API_KEY) {
        throw new Error(
            "XAI_API_KEY (or GROK_API_KEY) is not configured. Get a key at https://console.x.ai"
        );
    }

    const userContent = [{ type: "text", text: userText }];
    if (imagePath) {
        userContent.push({
            type: "image_url",
            image_url: {
                url: await imageUrlForGrok(imagePath),
                detail: "high",
            },
        });
    }

    const body = {
        model: GROK_MODEL,
        messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userContent },
        ],
        temperature: temperature ?? (jsonMode ? 0.4 : 0.6),
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
    responseSchema,
    temperature,
    jsonOutputInstruction,
}) {
    const parts = imagePath
        ? [{ text: userText }, await imageToGenerativePart(imagePath)]
        : [{ text: userText }];

    if (AI_PROVIDER === "grok") {
        return grokChat({
            systemInstruction: jsonMode
                ? `${systemInstruction}\n\n${jsonOutputInstruction ?? JSON_OUTPUT_INSTRUCTION}`
                : systemInstruction,
            userText,
            imagePath,
            jsonMode,
            temperature,
        });
    }

    if (AI_PROVIDER === "gemini") {
        return geminiWithModelFallback({
            systemInstruction,
            parts,
            jsonMode,
            responseSchema,
            temperature,
            jsonOutputInstruction,
        });
    }

    throw new Error(`Unknown AI_PROVIDER "${AI_PROVIDER}". Use "gemini" or "grok".`);
}

export async function analyzeStance(imagePath, question, athleteProfile = {}) {
    await validateSportsImage(imagePath, athleteProfile);
    
    //this stores the long prompt with athleate detailsprefernsce and shadowcoach standard of teaching
    const systemInstruction = buildCoachSystemInstruction(athleteProfile);

     //Image+ Question ai now has this 
    const userPrompt = question?.trim()
        ? `The athlete asks: "${question.trim()}"

       

Analyze the uploaded stance/posture image and answer their question as part of your coaching feedback.
Focus only on visible sports technique. Give specific, image-grounded observations.`
        : `Analyze the uploaded sports stance or posture image and provide a full coaching assessment.
Focus only on visible sports technique. Give specific, image-grounded observations about body positioning and movement.`;


    //..real AI call to gemini starts here
    const text = await generateCoachingText({
        systemInstruction,
        userText: userPrompt,
        imagePath,
        jsonMode: true,
    });
    
    //ai retrun string so we send it to convert to object has db expects obhjects
    // and validates the ai output format too Zod catches it. 
    return parseCoachingJson(text);
}

//functions ends back to controller

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
