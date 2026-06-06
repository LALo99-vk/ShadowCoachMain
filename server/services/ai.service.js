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

const DEFAULT_GEMINI_VISION_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash-lite",
];

function geminiModelChain({ preferVision = false } = {}) {
    const defaults = preferVision
        ? DEFAULT_GEMINI_VISION_MODELS
        : DEFAULT_GEMINI_FALLBACKS;
    const fromEnv = [
        preferVision ? process.env.GEMINI_VISION_MODEL : null,
        process.env.GEMINI_MODEL,
        ...(process.env.GEMINI_FALLBACK_MODELS?.split(",") || []),
        ...defaults,
    ]
        .map((m) => m?.trim())
        .filter(Boolean);
    return [...new Set(fromEnv)];
}

const SPORT_FOCUS_HINTS = {
    CRICKET:
        "batting or bowling setup: grip, head over the ball, front/back foot alignment, knee flex, shoulder line, bat angle, balance through the crease",
    FOOTBALL:
        "ready position: hip height, knee bend, center of gravity, foot spacing, body angle to play, arm position for balance",
    BASKETBALL:
        "shooting or defensive stance: foot base, knee tracking, hip alignment, elbow/wrist path, chest position, balance on toes/heels",
    BADMINTON:
        "split step, racket preparation, lunge knee angle, non-racket arm, torso rotation, weight transfer, court balance",
};

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

const visualAnalysisSchema = z.object({
    stanceDescription: z.string().min(10),
    cameraAngle: z.string().min(3),
    sportDetected: z.string().min(2),
    bodyObservations: z.array(z.string()).min(4),
    whatLooksGood: z.array(z.string()),
    whatLooksOff: z.array(z.string()),
    cannotAssess: z.array(z.string()),
    techniqueScore: z.number().int().min(0).max(100),
    scoreReasoning: z.string().min(10),
    imageQuality: z.enum(["POOR", "FAIR", "GOOD"]),
});

const VISUAL_ANALYSIS_JSON_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        stanceDescription: {
            type: SchemaType.STRING,
            description:
                "One sentence describing the exact stance/movement and setting visible in this photo",
        },
        cameraAngle: {
            type: SchemaType.STRING,
            description: "Camera angle relative to the athlete, e.g. side view, front view, low angle",
        },
        sportDetected: {
            type: SchemaType.STRING,
            description: "Sport or movement type inferred from the image",
        },
        bodyObservations: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description:
                "At least 4 specific factual observations about limbs, joints, feet, torso, equipment",
        },
        whatLooksGood: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "Technique elements that appear correct in this frame (can be empty array if none)",
        },
        whatLooksOff: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "Technique problems or risks visible in this frame (can be empty array if none)",
        },
        cannotAssess: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "Body parts or technique elements hidden by angle, clothing, blur, or crop",
        },
        techniqueScore: {
            type: SchemaType.INTEGER,
            description:
                "Honest 0-100 score for visible technique in THIS snapshot only. Do not default to 70-75.",
        },
        scoreReasoning: {
            type: SchemaType.STRING,
            description: "Two sentences explaining why this exact score fits what is visible",
        },
        imageQuality: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["POOR", "FAIR", "GOOD"],
        },
    },
    required: [
        "stanceDescription",
        "cameraAngle",
        "sportDetected",
        "bodyObservations",
        "whatLooksGood",
        "whatLooksOff",
        "cannotAssess",
        "techniqueScore",
        "scoreReasoning",
        "imageQuality",
    ],
};

const SCORE_RUBRIC = `
Honest scoring rubric (use the FULL range — do NOT cluster around 70):
- 85-100: Excellent visible technique; minor or no fixes needed in this frame
- 70-84: Solid fundamentals with 1-2 clear visible issues
- 55-69: Mixed form — some basics ok but multiple visible problems
- 40-54: Significant visible errors in posture, balance, or mechanics
- 0-39: Major breakdowns, unsafe positions, or barely recognizable athletic form
Poor image quality (blur, dark, cropped) → lower confidence, not a free high score.`;

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
confidenceLevel ("LOW" | "MEDIUM" | "HIGH").

Every strength and areasToImprove entry must cite a specific visible detail from THIS photo (body part + what you see).
Do not reuse generic coaching phrases across different images.
overallScore MUST equal the techniqueScore from the visual audit unless you explain a 1-3 point adjustment in priorityFix.`;

const VISUAL_ANALYSIS_INSTRUCTION = `
Respond with a single JSON object only (no markdown) with keys:
stanceDescription, cameraAngle, sportDetected, bodyObservations (array, min 4),
whatLooksGood (array), whatLooksOff (array), cannotAssess (array),
techniqueScore (integer 0-100), scoreReasoning, imageQuality ("POOR" | "FAIR" | "GOOD").

Rules:
- Report ONLY what you can see. No guessing hidden limbs.
- Be honest and critical. Do not inflate scores to be encouraging.
- Different images MUST get different observations and scores when form differs.
${SCORE_RUBRIC}`;

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

    const sportFocus =
        sport && SPORT_FOCUS_HINTS[sport]
            ? `For ${sport}, prioritize: ${SPORT_FOCUS_HINTS[sport]}.`
            : "Infer the sport/movement from the image and coach the visible technique.";

    return `You are ShadowCoach, an expert AI sports coach for amateur and competitive athletes.

Your job is to analyze sports stance, posture, and technique from a single photo and give honest, direct, actionable coaching.

Tone:
- Be truthful first, supportive second. Athletes need real feedback, not flattery.
- If form is weak, say so clearly and explain what you see wrong.
- Praise only what is genuinely visible and correct in this frame.

Strict scope:
- Only analyze images that show a person in a sports stance, athletic posture, training movement, or competition context.

Image-grounded analysis (critical):
- You will receive a visual audit extracted from the photo. Your coaching MUST match that audit.
- overallScore must align with the audit techniqueScore.
- strengths must expand on whatLooksGood from the audit — do not invent new positives.
- areasToImprove must expand on whatLooksOff from the audit — do not invent unrelated issues.
- priorityFix targets the most important item from whatLooksOff.
- drillSuggestion is one practical drill that fixes the priorityFix.
- If cannotAssess lists important body parts, set confidenceLevel to LOW or MEDIUM.

${SCORE_RUBRIC}

Guidelines:
- ${sportFocus}
- confidenceLevel must be exactly LOW, MEDIUM, or HIGH.
- Never use filler like "good athletic posture", "nice effort", or "keep practicing" without naming the exact body position you see.

${athleteLine ? `Athlete context: ${athleteLine}. Prioritize feedback for this sport and role.` : "No athlete profile was provided; infer the sport from the visual audit."}`;
}

function buildVisualAnalysisInstruction(athleteProfile = {}) {
    const sportHint = athleteProfile.sport
        ? `Athlete's registered sport: ${athleteProfile.sport}. Look for ${SPORT_FOCUS_HINTS[athleteProfile.sport] || "sport-specific technique"}.`
        : "Infer the sport from the image.";

    return `You are a sports biomechanics observer for ShadowCoach.

Your ONLY job is to inspect this photo and report factual visual evidence. You are NOT writing a motivational speech.

${sportHint}

${SCORE_RUBRIC}

Be blunt and precise. If knees are collapsed, say so. If back is rounded, say so. If form looks strong, say exactly why.
If the image is blurry, dark, or cropped, set imageQuality to POOR or FAIR and list what you cannotAssess.`;
}

function buildCoachingFromVisualPrompt(visual, question) {
    const auditBlock = JSON.stringify(visual, null, 2);
    const questionBlock = question?.trim()
        ? `\nAthlete question to address in priorityFix or drillSuggestion if relevant: "${question.trim()}"`
        : "";

    const strengthsRule =
        visual.whatLooksGood.length > 0
            ? `rewrite each whatLooksGood item into coach language (${visual.whatLooksGood.length} item(s))`
            : "pick the least-problematic visible element from bodyObservations — do not invent praise";

    const improveRule =
        visual.whatLooksOff.length > 0
            ? `rewrite each whatLooksOff item into coach language (${visual.whatLooksOff.length} item(s))`
            : "use scoreReasoning and bodyObservations to name the main limiter visible in this frame";

    const priorityRule =
        visual.whatLooksOff.length > 0
            ? "the single most important correction from whatLooksOff"
            : "the main technique limiter implied by scoreReasoning";

    return `Visual audit extracted from the photo (treat as ground truth for this analysis):
${auditBlock}
${questionBlock}

Turn this audit into coaching JSON.
- overallScore: use techniqueScore (${visual.techniqueScore}) exactly
- strengths: ${strengthsRule}
- areasToImprove: ${improveRule}
- priorityFix: ${priorityRule}
- drillSuggestion: one drill that directly fixes priorityFix
- confidenceLevel: LOW if imageQuality is POOR or cannotAssess hides key areas; MEDIUM if FAIR; HIGH if GOOD and most body visible`;
}

function parseVisualAnalysisJson(rawText) {
    let parsed;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (!match) {
            throw new Error("AI returned invalid JSON for visual analysis");
        }
        parsed = JSON.parse(match[0]);
    }

    const result = visualAnalysisSchema.safeParse(parsed);
    if (!result.success) {
        throw new Error(
            `AI visual analysis did not match expected format: ${result.error.message}`
        );
    }
    return result.data;
}

function alignCoachingWithVisual(coaching, visual) {
    const aligned = { ...coaching };

    if (Math.abs(coaching.overallScore - visual.techniqueScore) > 3) {
        aligned.overallScore = visual.techniqueScore;
    }

    if (visual.imageQuality === "POOR" && aligned.confidenceLevel === "HIGH") {
        aligned.confidenceLevel = "LOW";
    } else if (
        visual.imageQuality === "FAIR" &&
        aligned.confidenceLevel === "HIGH"
    ) {
        aligned.confidenceLevel = "MEDIUM";
    }

    return aligned;
}

async function extractVisualAnalysis(imagePath, athleteProfile = {}, validation = {}) {
    const detectedHint = validation.detectedContent?.trim()
        ? `Upload pre-check noted: "${validation.detectedContent}". Confirm or correct this by looking at the image.`
        : "";

    const text = await generateCoachingText({
        systemInstruction: buildVisualAnalysisInstruction(athleteProfile),
        userText: `${detectedHint}

Study the photo carefully. List only visible facts and assign an honest techniqueScore for this exact frame.`,
        imagePath,
        jsonMode: true,
        responseSchema: VISUAL_ANALYSIS_JSON_SCHEMA,
        jsonOutputInstruction: VISUAL_ANALYSIS_INSTRUCTION,
        temperature: 0.25,
        preferVision: true,
        imageFirst: true,
    });

    return parseVisualAnalysisJson(text);
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
    preferVision = false,
}) {
    const models = geminiModelChain({ preferVision });
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
    preferVision = false,
    imageFirst = false,
}) {
    let parts;
    if (imagePath) {
        const imagePart = await imageToGenerativePart(imagePath);
        parts = imageFirst
            ? [imagePart, { text: userText }]
            : [{ text: userText }, imagePart];
    } else {
        parts = [{ text: userText }];
    }

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
            preferVision,
        });
    }

    throw new Error(`Unknown AI_PROVIDER "${AI_PROVIDER}". Use "gemini" or "grok".`);
}

export async function analyzeStance(imagePath, question, athleteProfile = {}) {
    const validation = await validateSportsImage(imagePath, athleteProfile);

    const visual = await extractVisualAnalysis(
        imagePath,
        athleteProfile,
        validation
    );

    const systemInstruction = buildCoachSystemInstruction(athleteProfile);
    const userPrompt = buildCoachingFromVisualPrompt(visual, question);

    const text = await generateCoachingText({
        systemInstruction,
        userText: userPrompt,
        imagePath,
        jsonMode: true,
        temperature: 0.45,
        preferVision: true,
        imageFirst: true,
    });

    const coaching = alignCoachingWithVisual(parseCoachingJson(text), visual);

    return {
        ...coaching,
        visualAudit: visual,
    };
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
