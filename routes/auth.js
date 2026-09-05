import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../prismaClient.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, churchId: user.churchId },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.toLowerCase(),
    church_id: user.churchId,
  };
}

router.post("/register", async (req, res) => {
  const { churchName, name, email, password } = req.body;
  if (!churchName || !name || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const church = await prisma.church.create({ data: { name: churchName } });

    const user = await prisma.user.create({
      data: { churchId: church.id, name, email, passwordHash, role: "ADMIN" },
    });

    const token = signToken(user);
    res.status(201).json({ token, user: serializeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Something went wrong" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user)
      return res.status(401).json({ message: "Invalid email or password" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid)
      return res.status(401).json({ message: "Invalid email or password" });

    const token = signToken(user);
    res.json({ token, user: serializeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Something went wrong" });
  }
});

router.post("/logout", (req, res) => {
  res.status(200).json({ message: "Logged out" });
});

router.get("/me", authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(serializeUser(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Something went wrong" });
  }
});

router.get("/users", authenticate, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { churchId: req.user.churchId },
      orderBy: { createdAt: "asc" },
    });
    res.json(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role.toLowerCase(),
        status: u.status.toLowerCase(),
      })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load team members" });
  }
});

router.post("/users", authenticate, async (req, res) => {
  if (req.user.role !== "ADMIN") {
    return res
      .status(403)
      .json({ message: "Only Admins can add team members" });
  }
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ message: "Name, email, and password are required" });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing)
      return res.status(409).json({ message: "Email already in use" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        churchId: req.user.churchId,
        name,
        email,
        passwordHash,
        role: "MEDIA_TEAM",
      },
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.toLowerCase(),
      status: user.status.toLowerCase(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not add team member" });
  }
});

router.patch("/users/:id", authenticate, async (req, res) => {
  if (req.user.role !== "ADMIN") {
    return res
      .status(403)
      .json({ message: "Only Admins can update team members" });
  }
  const { status } = req.body;
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status: status.toUpperCase() },
    });
    res.json({ id: user.id, status: user.status.toLowerCase() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not update team member" });
  }
});

router.patch("/me", authenticate, async (req, res) => {
  const { name, currentPassword, newPassword } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const updateData = {};

    if (name) {
      updateData.name = name;
    }

    if (newPassword) {
      if (!currentPassword) {
        return res
          .status(400)
          .json({ message: "Current password is required to set a new one" });
      }
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        return res
          .status(401)
          .json({ message: "Current password is incorrect" });
      }
      updateData.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
    });

    res.json(serializeUser(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not update profile" });
  }
});

export default router;
