import express from "express";
import { AccessToken } from "livekit-server-sdk";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.post("/", authenticate, async (req, res) => {
  const { roomName, participantName } = req.body;
  if (!roomName || !participantName) {
    return res.status(400).json({ message: "roomName and participantName are required" });
  }

  const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity: participantName,
  });
  at.addGrant({ roomJoin: true, room: roomName });

  const token = await at.toJwt();
  res.json({ token, url: process.env.LIVEKIT_URL });
});

export default router;