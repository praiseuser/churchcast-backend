import express from "express";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import fs from "fs";
import path from "path";
import os from "os";
import { v2 as cloudinary } from "cloudinary";
import prisma from "../prismaClient.js";
import { authenticate } from "../middleware/auth.js";

ffmpeg.setFfmpegPath(ffmpegPath);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const router = express.Router();
const NOISE_MODEL_PATH = path.join(
  process.cwd(),
  "models",
  "noise-reduction.rnnn",
);

router.post("/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  const {
    trimStart,
    trimEnd,
    pastorMicVolume,
    masterVolume,
    format,
    noiseReduction,
  } = req.body;

  try {
    const recording = await prisma.recording.findUnique({ where: { id } });
    if (!recording || !recording.videoUrl) {
      return res.status(404).json({ message: "Recording or video not found" });
    }

    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `${id}-input.mp4`);
    const outputExt = format === "audio" ? "mp3" : "mp4";
    const outputPath = path.join(tempDir, `${id}-export.${outputExt}`);

    const response = await fetch(recording.videoUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(inputPath, buffer);

    const pastorGain = (pastorMicVolume ?? 85) / 100;
    const masterGain = (masterVolume ?? 90) / 100;
    const combinedVolume = pastorGain * masterGain;

    const audioFilters = [`volume=${combinedVolume}`];
    if (noiseReduction && fs.existsSync(NOISE_MODEL_PATH)) {
      audioFilters.push(
        `arnndn=model=${NOISE_MODEL_PATH.replace(/\\/g, "/")}:mix=0.8`,
      );
    }

    await new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .setStartTime(trimStart || 0)
        .duration((trimEnd || 0) - (trimStart || 0))
        .audioFilters(audioFilters);

      if (format === "audio") {
        command = command.noVideo().audioCodec("libmp3lame");
      } else {
        command = command.videoCodec("copy");
      }

      command.on("end", resolve).on("error", reject).save(outputPath);
    });

    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_large(
        outputPath,
        {
          resource_type: format === "audio" ? "video" : "video", // Cloudinary treats audio-only as "video" resource type for mp3 too
          public_id: `${id}-export-${Date.now()}`,
          folder: "churchcast-exports",
          chunk_size: 6000000,
        },
        (error, result) => (error ? reject(error) : resolve(result)),
      );
    });

    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

    res.json({ downloadUrl: uploadResult.secure_url });
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ message: "Export failed", detail: err.message });
  }
});

export default router;
