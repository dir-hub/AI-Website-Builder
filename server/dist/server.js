import "dotenv/config";
import express from 'express';
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
const app = express();
// Middleware
app.use(express.json());
const port = process.env.PORT || 3000;
const trustedOrigins = process.env.TRUSTED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) || [];
const corsOptions = {
    origin: trustedOrigins,
    credentials: true,
};
app.use(cors(corsOptions));
app.use('/api/auth', toNodeHandler(auth));
app.get('/', (req, res) => {
    res.send('Server is Live!');
});
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
