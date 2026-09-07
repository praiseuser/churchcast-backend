import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import recordingsRoutes from "./routes/recordings.js";
import egressRoutes from "./routes/egress.js";
import exportRoutes from "./routes/export.js";
import churchRoutes from "./routes/church.js";
import tokenRoutes from "./routes/token.js";

const app = express();

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS || "http://localhost:5173"
).split(",");

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/recordings", recordingsRoutes);
app.use("/api/egress", egressRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/church", churchRoutes);
app.use("/api/token", tokenRoutes);

app.get("/api/ping", (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() }),
);
app.get("/", (req, res) => {
  res.json({ status: "ChurchCast Studio API running" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`),
);
