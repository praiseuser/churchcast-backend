import express from "express";
import { EgressClient, EncodedFileType, S3Upload } from "livekit-server-sdk";
import prisma from "../prismaClient.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

const egressClient = new EgressClient(
  process.env.LIVEKIT_URL,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET,
);

// Starts recording a live room to Supabase storage
router.post("/:id/start", authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const recording = await prisma.recording.findUnique({ where: { id } });
    if (!recording)
      return res.status(404).json({ message: "Recording not found" });

    const output = {
      fileType: EncodedFileType.MP4,
      filepath: `${id}.mp4`,
      output: {
        case: "s3",
        value: new S3Upload({
          accessKey: process.env.SUPABASE_S3_ACCESS_KEY,
          secret: process.env.SUPABASE_S3_SECRET_KEY,
          bucket: process.env.SUPABASE_S3_BUCKET,
          endpoint: process.env.SUPABASE_S3_ENDPOINT,
          region: process.env.SUPABASE_S3_REGION,
          forcePathStyle: true,
        }),
      },
    };

    const info = await egressClient.startRoomCompositeEgress(id, {
      file: output,
    });

    await prisma.recording.update({
      where: { id },
      data: { egressId: info.egressId, status: "RECORDING" },
    });

    res.json({ egressId: info.egressId });
  } catch (err) {
    console.error("Start egress error:", err);
    res
      .status(500)
      .json({ message: "Could not start recording", detail: err.message });
  }
});

// Stops recording and saves the final video URL
router.post("/:id/stop", authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const recording = await prisma.recording.findUnique({ where: { id } });
    if (!recording || !recording.egressId) {
      return res.status(404).json({ message: "No active recording found" });
    }

    await egressClient.stopEgress(recording.egressId);

    const videoUrl = `${process.env.SUPABASE_S3_ENDPOINT.replace("/storage/v1/s3", "")}/storage/v1/object/public/${process.env.SUPABASE_S3_BUCKET}/${id}.mp4`;

    await prisma.recording.update({
      where: { id },
      data: { status: "EDITING", videoUrl },
    });

    res.json({ videoUrl });
  } catch (err) {
    console.error("Stop egress error:", err);
    res
      .status(500)
      .json({ message: "Could not stop recording", detail: err.message });
  }
});

export default router;
