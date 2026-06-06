import path from "path";
import multer from "multer";

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
]);

const MIME_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

/**
 * Detect real image format from file header bytes (not the client-reported MIME type).
 * Browsers often send wrong or generic MIME types; sniffing is more reliable.
 */
export function detectImageType(buffer) {
    if (!buffer || buffer.length < 4) {
        return null;
    }

    // JPEG — SOI marker is FF D8 (third byte is not always FF)
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        return "image/jpeg";
    }

    // PNG
    if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
    ) {
        return "image/png";
    }

    // GIF87a / GIF89a
    if (buffer.toString("ascii", 0, 3) === "GIF") {
        return "image/gif";
    }

    // WebP — RIFF....WEBP
    if (
        buffer.length >= 12 &&
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
        return "image/webp";
    }

    return null;
}

export function validateImageBuffer(buffer) {
    if (!buffer?.length) {
        return { ok: false, message: "Image file is empty or corrupted" };
    }

    if (buffer.length > MAX_FILE_SIZE) {
        return { ok: false, message: "Image must be 10 MB or smaller" };
    }

    const detectedType = detectImageType(buffer);

    if (!detectedType || !ALLOWED_IMAGE_MIME_TYPES.has(detectedType)) {
        return {
            ok: false,
            message: "Only JPEG, PNG, WebP, and GIF images are allowed",
        };
    }

    return { ok: true, detectedType };
}

function isLikelyImageUpload(file) {
    const mimetype = (file.mimetype || "").toLowerCase();
    const ext = path.extname(file.originalname || "").toLowerCase();

    if (ALLOWED_IMAGE_MIME_TYPES.has(mimetype)) {
        return true;
    }

    // Some browsers send non-standard but valid image MIME types
    if (["image/jpg", "image/pjpeg", "image/x-png"].includes(mimetype)) {
        return true;
    }

    if (mimetype.startsWith("image/") && ALLOWED_EXTENSIONS.has(ext)) {
        return true;
    }

    if (ALLOWED_EXTENSIONS.has(ext)) {
        return true;
    }

    return false;
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        if (!isLikelyImageUpload(file)) {
            return cb(
                new Error("Only JPEG, PNG, WebP, and GIF images are allowed")
            );
        }
        cb(null, true);
    },
});

export function extensionForMime(mime) {
    return MIME_TO_EXT[mime] || ".jpg";
}

export function handleUploadError(err, _req, res, next) {
    if (!err) {
        return next();
    }

    if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "Image must be 10 MB or smaller" });
    }

    if (
        err.message?.includes("Only JPEG") ||
        err.message?.includes("image")
    ) {
        return res.status(400).json({ message: err.message });
    }

    return next(err);
}

export default upload;
