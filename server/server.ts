import "dotenv/config";
import express, { Request, Response } from 'express';
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import userRouter from "./routes/userRoutes.js";
import projectRouter from "./routes/projectRoutes.js";
import { stripeWebhook } from "./controllers/stripeWebhook.js";

const app = express();

const port = process.env.PORT || 3000;
const trustedOrigins =
  process.env.TRUSTED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) || [];

const corsOptions = {
    origin: trustedOrigins,
    credentials: true,
};

app.use(cors(corsOptions));

// Stripe Webhook (MUST be before any body parser to get raw body for signature verification)
app.post('/api/stripe', express.raw({type: '*/*'}), stripeWebhook);

// Regular body parsers for all other routes
app.use(express.json({ limit: '50mb' }));

app.use('/api/auth', toNodeHandler(auth));

app.get('/', (req: Request, res: Response) => {
    res.send('Server is Live!');
});

app.use('/api/user', userRouter);
app.use('/api/project', projectRouter);

if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server is running at http://localhost:${port}`);
    });
}

export default app;
