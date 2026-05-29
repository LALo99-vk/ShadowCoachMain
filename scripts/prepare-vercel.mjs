import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nitroOut = path.join(root, "frontend/.vercel/output");
const out = path.join(root, ".vercel/output");
const apiFunc = path.join(out, "functions/api.func");

function modulesRoot() {
    const serverModules = path.join(root, "server/node_modules");
    if (fs.existsSync(path.join(serverModules, "@prisma/client"))) {
        return serverModules;
    }
    return path.join(root, "node_modules");
}

function copyDir(src, dest) {
    if (!fs.existsSync(src)) {
        return;
    }
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(from, to);
        } else {
            fs.copyFileSync(from, to);
        }
    }
}

async function loadEsbuild() {
    try {
        return await import("esbuild");
    } catch {
        const local = path.join(root, "node_modules/esbuild/lib/main.js");
        return await import(local);
    }
}

async function main() {
    if (!fs.existsSync(nitroOut)) {
        console.error("Missing frontend/.vercel/output — run with VERCEL=1");
        process.exit(1);
    }

    copyDir(nitroOut, out);

    fs.mkdirSync(apiFunc, { recursive: true });

    const bundleOut = path.join(apiFunc, "index.mjs");
    const esbuild = await loadEsbuild();

    await esbuild.build({
        entryPoints: [path.join(root, "server/app.js")],
        bundle: true,
        platform: "node",
        target: "node20",
        format: "esm",
        outfile: bundleOut,
        external: ["@prisma/client", ".prisma/client/*", "sharp", "bcrypt"],
    });

    copyDir(path.join(modulesRoot(), ".prisma"), path.join(apiFunc, "node_modules/.prisma"));
    copyDir(
        path.join(modulesRoot(), "@prisma/client"),
        path.join(apiFunc, "node_modules/@prisma/client"),
    );
    copyDir(path.join(modulesRoot(), "bcrypt"), path.join(apiFunc, "node_modules/bcrypt"));
    copyDir(
        path.join(modulesRoot(), "node-gyp-build"),
        path.join(apiFunc, "node_modules/node-gyp-build"),
    );

    fs.writeFileSync(
        path.join(apiFunc, ".vc-config.json"),
        JSON.stringify(
            {
                runtime: "nodejs22.x",
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

    console.log("Prepared .vercel/output with Express API at /api");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
