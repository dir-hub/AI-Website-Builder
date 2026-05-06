import "dotenv/config";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./prisma.js";

const trustedOrigins =
  process.env.TRUSTED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) || [];
const baseURL = process.env.BETTER_AUTH_URL?.trim();
const secret = process.env.BETTER_AUTH_SECRET?.trim();

if (!baseURL) {
  throw new Error("Missing BETTER_AUTH_URL in server/.env");
}

if (!secret) {
  throw new Error("Missing BETTER_AUTH_SECRET in server/.env");
}

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql", // or "mysql", "postgresql", ...etc
    }),
    emailAndPassword: { 
    enabled: true, 
  },
  user: {
    deleteUser: {enabled: true}
  },
  trustedOrigins,
  baseURL,
  secret,
  advanced:{
    cookies:{
        session_token:{
            name: "auth_session",
            attributes:{
                httpOnly: true,
                secure:process.env.NODE_ENV === "production",
                sameSite: process.env.NODE_ENV === "production" ? "None" : "lax",
                path: "/",
            }
        }
    }
  }
});