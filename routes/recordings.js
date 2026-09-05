import express from "express";
import prisma from "../prismaClient.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.post("/start", authenticate, async (req, res) => {
  const { title, type, date } = req.body;
  if (!title || !type || !date) {
    return res
      .status(400)
      .json({ message: "title, type, and date are required" });
  }

  try {
    const service = await prisma.service.create({
      data: {
        churchId: req.user.churchId,
        title,
        type,
      },
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

    const formatted = recordings.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.service?.type || "Service",
      date: r.date,
      status: r.status.toLowerCase(),
      videoUrl: r.videoUrl,
      recordedBy: r.recordedBy?.name || "Unknown",
    }));

    res.json(formatted);
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
    if (!recording) return res.status(404).json({ message: "Recording not found" });

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

export default router;