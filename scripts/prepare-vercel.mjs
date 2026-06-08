import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nitroOut = path.join(root, "frontend/.vercel/output");
const out = path.join(root, ".vercel/output");
const apiFunc = path.join(out, "functions/api.func");

const SERVER_EXCLUDE = new Set([
    "node_modules",
    "uploads",
    ".env",
    ".git",
]);

const NODE_MODULES_PRUNE = [
    "prisma",
    "nodemon",
    "@prisma/internals",
];

function copyDir(src, dest, { exclude = null } = {}) {
    if (!fs.existsSync(src)) {
        return;
    }
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (exclude?.has(entry.name)) {
            continue;
        }
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(from, to, { exclude });
        } else {
            fs.copyFileSync(from, to);
        }
    }
}

function rmDir(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function dirSizeBytes(dir) {
    if (!fs.existsSync(dir)) {
        return 0;
    }
    let total = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        total += entry.isDirectory() ? dirSizeBytes(full) : fs.statSync(full).size;
    }
    return total;
}

function formatBytes(bytes) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
}

async function main() {
    if (!fs.existsSync(nitroOut)) {
        console.error("Missing frontend/.vercel/output — run with VERCEL=1");
        process.exit(1);
    }

    copyDir(nitroOut, out);

    fs.mkdirSync(apiFunc, { recursive: true });

    copyDir(path.join(root, "server"), path.join(apiFunc, "server"), {
        exclude: SERVER_EXCLUDE,
    });
    copyDir(path.join(root, "server/node_modules"), path.join(apiFunc, "node_modules"));

    for (const pkg of NODE_MODULES_PRUNE) {
        rmDir(path.join(apiFunc, "node_modules", pkg));
    }

    fs.writeFileSync(
        path.join(apiFunc, "index.mjs"),
        `import app from "./server/app.js";\nexport default app;\n`,
    );

    fs.writeFileSync(
        path.join(apiFunc, ".vc-config.json"),
        JSON.stringify(
            {
                runtime: "nodejs20.x",
                handler: "index.mjs",
                launcherType: "Nodejs",
                shouldAddHelpers: true,
            },
            null,
            2,
        ),
    );

    const configPath = path.join(out, "config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const assetRoute = config.routes.find((route) => route.src === "/assets/(.*)");
    const serverRoute = config.routes.find((route) => route.dest === "/__server");

    config.routes = [
        assetRoute,
        { src: "/api/(.*)", dest: "/api" },
        { handle: "filesystem" },
        serverRoute ?? { src: "/(.*)", dest: "/__server" },
    ].filter(Boolean);

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const apiSize = dirSizeBytes(apiFunc);
    console.log(`Prepared .vercel/output with Express API at /api (${formatBytes(apiSize)})`);
    if (apiSize > 250 * 1024 * 1024) {
        console.warn(
            `WARNING: api.func is ${formatBytes(apiSize)} — exceeds Vercel's 250 MB unzipped limit`,
        );
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
