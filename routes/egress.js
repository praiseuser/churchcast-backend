import express from "express";
import { EgressClient, StreamOutput, StreamProtocol } from "livekit-server-sdk";
import prisma from "../prismaClient.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

const egressClient = new EgressClient(
  process.env.LIVEKIT_URL,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET,
);

router.post("/:id/start", authenticate, async (req, res) => {
  const { id } = req.params;
  const { streamToFacebook } = req.body;

  if (!streamToFacebook) {
    return res.json({ skipped: true });
  }

  try {
    const church = await prisma.church.findUnique({
      where: { id: req.user.churchId },
    });
    if (!church?.facebookStreamUrl) {
      return res
        .status(400)
        .json({ message: "No Facebook stream URL saved in Church Settings" });
    }

    const info = await egressClient.startRoomCompositeEgress(id, {
      stream: new StreamOutput({
        protocol: StreamProtocol.RTMP,
        urls: [church.facebookStreamUrl],
      }),
    });

    await prisma.recording.update({
      where: { id },
      data: { egressId: info.egressId },
    });
    res.json({ egressId: info.egressId });
  } catch (err) {
    console.error("Start egress error:", err);
    res
      .status(500)
      .json({
        message: "Could not start Facebook stream",
        detail: err.message,
      });
  }
});

router.post("/:id/stop", authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const recording = await prisma.recording.findUnique({ where: { id } });
    if (recording?.egressId) {
      await egressClient.stopEgress(recording.egressId);
    }
    res.json({ stopped: true });
  } catch (err) {
    console.error("Stop egress error:", err);
    res
      .status(500)
      .json({ message: "Could not stop stream", detail: err.message });
  }
});

export default router;
