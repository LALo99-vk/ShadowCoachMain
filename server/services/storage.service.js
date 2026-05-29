import fs from "fs";
import path from "path";
import cloudinary from "../config/cloudinary.js";

export function assertCloudinaryConfigured() {
    const required = [
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
    ];
    const missing = required.filter((key) => !process.env[key]?.trim());
    if (missing.length > 0) {
        throw new Error(
            `Missing Cloudinary env vars: ${missing.join(", ")}. Add them to server/.env from https://console.cloudinary.com/`
        );
    }
}

export async function uploadImageToCloudinary(localPath) {
    assertCloudinaryConfigured();

    const absolutePath = path.resolve(localPath);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Image file not found for upload: ${absolutePath}`);
    }

    try {
        const result = await cloudinary.uploader.upload(absolutePath, {
            folder: "shadowCoach",
            resource_type: "image",
        });
        return result;
    } catch (err) {
        const cloudinaryMessage =
            err?.error?.message || err?.message || "Unknown Cloudinary error";
        const code = err?.http_code || err?.error?.http_code;

        const hint =
            code === 403
                ? "403 usually means wrong API secret, restricted API key, or inactive Cloudinary account. In the dashboard: Settings → API Keys → copy Cloud name, API Key, and API Secret exactly (regenerate secret if unsure). Ensure the key allows Upload."
                : "Verify CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env.";

        throw new Error(
            `Cloudinary upload failed${code ? ` (${code})` : ""}: ${cloudinaryMessage}. ${hint}`
        );
    }
}

function publicIdFromCloudinaryUrl(imageUrl) {
    if (!imageUrl?.includes("cloudinary.com")) {
        return null;
    }
    const afterUpload = imageUrl.split("/upload/")[1];
    if (!afterUpload) {
        return null;
    }
    const withoutVersion = afterUpload.replace(/^v\d+\//, "");
    return withoutVersion.replace(/\.[^/.]+$/, "");
}

export async function deleteImageFromCloudinary(imageUrl) {
    const publicId = publicIdFromCloudinaryUrl(imageUrl);
    if (!publicId) {
        return;
    }

    try {
        await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
    } catch (err) {
        console.warn("Cloudinary delete failed:", err?.message || err);
    }
}
