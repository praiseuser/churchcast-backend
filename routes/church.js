import express from "express";
import prisma from "../prismaClient.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, async (req, res) => {
  try {
    const church = await prisma.church.findUnique({
      where: { id: req.user.churchId },
    });
    if (!church) return res.status(404).json({ message: "Church not found" });
    res.json(church);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load church settings" });
  }
});

router.put("/", authenticate, async (req, res) => {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ message: "Only Admins can update church settings" });
  }
  const { name, brandingColors } = req.body;
  try {
    const church = await prisma.church.update({
      where: { id: req.user.churchId },
      data: { name, brandingColors },
    });
    res.json(church);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not update church settings" });
  }
});

export default router;