import express from "express";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import fs from "fs";
import path from "path";
import os from "os";
import { createClient } from "@supabase/supabase-js";
import prisma from "../prismaClient.js";
import { authenticate } from "../middleware/auth.js";

ffmpeg.setFfmpegPath(ffmpegPath);

const router = express.Router();

const supabase = createClient(
  `https://${process.env.SUPABASE_S3_ENDPOINT.split("/")[2].split(".")[0]}.supabase.co`,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.post("/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  const { trimStart, trimEnd, pastorMicVolume, masterVolume, format } = req.body;

  try {
    const recording = await prisma.recording.findUnique({ where: { id } });
    if (!recording || !recording.videoUrl) {
      return res.status(404).json({ message: "Recording or video not found" });
    }

    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `${id}-input.mp4`);
    const outputExt = format === "audio" ? "mp3" : "mp4";
    const outputPath = path.join(tempDir, `${id}-export.${outputExt}`);

    // Download the original file to a temp location
    const response = await fetch(recording.videoUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(inputPath, buffer);

    const pastorGain = (pastorMicVolume ?? 85) / 100;
    const masterGain = (masterVolume ?? 90) / 100;
    const combinedVolume = pastorGain * masterGain;

    await new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .setStartTime(trimStart || 0)
        .duration((trimEnd || 0) - (trimStart || 0))
        .audioFilters(`volume=${combinedVolume}`);

      if (format === "audio") {
        command = command.noVideo().audioCodec("libmp3lame");
      } else {
        command = command.videoCodec("copy");
      }

      command
        .on("end", resolve)
        .on("error", reject)
        .save(outputPath);
    });

    const fileBuffer = fs.readFileSync(outputPath);
    const storagePath = `exports/${id}-${Date.now()}.${outputExt}`;

    const { error: uploadError } = await supabase.storage
      .from("recordings")
      .upload(storagePath, fileBuffer, {
        contentType: format === "audio" ? "audio/mpeg" : "video/mp4",
      });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from("recordings")
      .getPublicUrl(storagePath);

    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

    res.json({ downloadUrl: publicUrlData.publicUrl });
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ message: "Export failed", detail: err.message });
  }
});

export default router;