import { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";

export const protect = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers)
        });
        if (!session || !session.user) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        req.userId = session.user.id;
        next();
    } catch (error: any) {
        console.error(error);
        res.status(401).json({ message: error.message || error.code });
    }
}