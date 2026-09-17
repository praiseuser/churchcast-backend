import express from "express";
import prisma from "../prismaClient.js";
import { authenticate } from "../middleware/auth.js";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";
import os from "os";

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const tempFiles = new Map();

router.post("/start", authenticate, async (req, res) => {
  const { title, type, date } = req.body;
  if (!title || !type || !date) {
    return res
      .status(400)
      .json({ message: "title, type, and date are required" });
  }

  try {
    const service = await prisma.service.create({
      data: { churchId: req.user.churchId, title, type },
    });

    const recording = await prisma.recording.create({
      data: {
        churchId: req.user.churchId,
        serviceId: service.id,
        recordedById: req.user.id,
        title,
        date: new Date(date),
        status: "RECORDING",
      },
    });

    res.status(201).json(recording);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Something went wrong" });
  }
});

router.get("/", authenticate, async (req, res) => {
  try {
    const recordings = await prisma.recording.findMany({
      where: { churchId: req.user.churchId },
      include: { service: true, recordedBy: true },
      orderBy: { date: "desc" },
    });

    res.json(
      recordings.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.service?.type || "Service",
        date: r.date,
        status: r.status.toLowerCase(),
        videoUrl: r.videoUrl,
        recordedBy: r.recordedBy?.name || "Unknown",
      })),
    );
  } catch (err) {
    console.error("List recordings error:", err);
    res.status(500).json({ message: "Could not load recordings" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    const recording = await prisma.recording.findUnique({
      where: { id: req.params.id },
      include: { service: true, recordedBy: true },
    });
    if (!recording)
      return res.status(404).json({ message: "Recording not found" });

    res.json({
      id: recording.id,
      title: recording.title,
      type: recording.service?.type || "Service",
      date: recording.date,
      status: recording.status.toLowerCase(),
      videoUrl: recording.videoUrl,
      recordedBy: recording.recordedBy?.name || "Unknown",
    });
  } catch (err) {
    console.error("Get recording error:", err);
    res.status(500).json({ message: "Could not load recording" });
  }
});

router.post(
  "/:id/chunk",
  authenticate,
  upload.single("chunk"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ message: "No chunk received" });

      const { id } = req.params;
      let filePath = tempFiles.get(id);
      if (!filePath) {
        filePath = path.join(os.tmpdir(), `${id}.webm`);
        tempFiles.set(id, filePath);
      }

      fs.appendFileSync(filePath, req.file.buffer);
      res.json({ ok: true });
    } catch (err) {
      console.error("Chunk upload error:", err);
      res.status(500).json({ message: "Could not save chunk" });
    }
  },
);

router.post("/:id/finalize", authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const filePath = tempFiles.get(id);
    if (!filePath || !fs.existsSync(filePath)) {
      return res
        .status(404)
        .json({ message: "No recording chunks found to finalize" });
    }

    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_large(
        filePath,
        {
          resource_type: "video",
          public_id: id,
          folder: "churchcast-recordings",
          chunk_size: 6000000,
        },
        (error, result) => (error ? reject(error) : resolve(result)),
      );
    });

    fs.unlinkSync(filePath);
    tempFiles.delete(id);

    const recording = await prisma.recording.update({
      where: { id },
      data: { videoUrl: uploadResult.secure_url, status: "EDITING" },
    });

    res.json({ videoUrl: recording.videoUrl });
  } catch (err) {
    console.error("Finalize error:", err);
    res
      .status(500)
      .json({ message: "Could not finalize recording", detail: err.message });
  }
});

router.get("/live", authenticate, async (req, res) => {
  try {
    const recordings = await prisma.recording.findMany({
      where: { churchId: req.user.churchId, status: "RECORDING" },
      include: { recordedBy: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(
      recordings.map((r) => ({
        id: r.id,
        title: r.title,
        recordedBy: r.recordedBy?.name || "Unknown",
      }))
    );
  } catch (err) {
    console.error("List live recordings error:", err);
    res.status(500).json({ message: "Could not load live recordings" });
  }
});

export default router;
