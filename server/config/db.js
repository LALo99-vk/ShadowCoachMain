import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

const prisma =
    // During development, hot reloading can recreate mulyiple clients 
    globalForPrisma.prisma ??
    //runs once and stores in gloablprisma
    new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}

export default prisma;
