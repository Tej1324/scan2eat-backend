require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { Server } = require("socket.io");

const Order = require("./models/Order");
const MenuItem = require("./models/MenuItem"); // ✅ NEW

const app = express();
app.set("trust proxy", 1);

const server = http.createServer(app);
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");


/* ================= CONFIG ================= */
const PORT = process.env.PORT;
const isProd = process.env.NODE_ENV === "production";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "scan2eat-menu",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

const upload = multer({ storage });

/* ================= PROD ORIGINS ================= */
const PROD_ORIGINS = [
  "https://scan2eat-frontend.vercel.app",
  "https://scan2eat-cashier.netlify.app",
  "https://scan2eat-kitchen.netlify.app",
  "http://127.0.0.1:5500" // TEMP ONLY

];

/* ================= CORS (STRICT PROD + OPEN DEV) ================= */
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (!isProd) return callback(null, true);
    if (PROD_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error("CORS blocked"), false);
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-access-token"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* ================= MIDDLEWARE ================= */
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(helmet());
app.disable("x-powered-by");

/* ================= RATE LIMIT ================= */
app.use(
  "/api",
  rateLimit({
    windowMs: 1 * 60 * 1000,
    max: isProd ? 100 : 1000,
  })
);

/* ================= SOCKET.IO ================= */
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (!isProd) return callback(null, true);
      if (PROD_ORIGINS.includes(origin)) return callback(null, true);
      return callback("CORS blocked", false);
    },
    methods: ["GET", "POST"],
  },
});

require("./socket")(io);

/* ================= DB ================= */
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB error:", err.message);
    process.exit(1);
  });

/* ================= AUTH ================= */
function requireCashier(req, res, next) {
  const token = req.headers["x-access-token"];
  if (token !== process.env.CASHIER_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/* ================= ORDER ROUTES (UNCHANGED) ================= */

app.post("/api/orders", async (req, res) => {
  try {
    const { tableId, items } = req.body;

    if (!Number.isInteger(tableId) || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: "Invalid order" });
    }

    const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);

    const order = await Order.create({
      tableId,
      items,
      total,
      status: "pending",
    });

    io.emit("order:new", order);
    res.status(201).json(order);
  } catch (err) {
    console.error("❌ Order error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/orders", async (req, res) => {
  const orders = await Order.find().sort({ createdAt: 1 });
  res.json(orders);
});

function requireStaff(req, res, next) {
  const token = req.headers["x-access-token"];

  if (
    token === process.env.CASHIER_TOKEN ||
    token === process.env.KITCHEN_TOKEN
  ) {
    return next();
  }

  return res.status(401).json({ error: "Unauthorized" });
}


/* ================= MENU ROUTES (NEW) ================= */

/* CUSTOMER MENU (ONLY AVAILABLE ITEMS) */
app.get("/api/menu", async (req, res) => {
  const items = await MenuItem.find({ available: true }).sort({ createdAt: 1 });
  res.json(items);
});

/* CASHIER MENU (ALL ITEMS) */
app.get("/api/menu/all", requireCashier, async (req, res) => {
  const items = await MenuItem.find().sort({ createdAt: 1 });
  res.json(items);
});

/* ADD MENU ITEM */
app.post("/api/menu", requireCashier, async (req, res) => {
  const { name, price, description, imageUrl } = req.body;

  const item = await MenuItem.create({
    name,
    price,
    description,
    imageUrl,
  });

  io.emit("menu:update"); // 🔄 future live refresh
  res.status(201).json(item);
});

/* TOGGLE AVAILABILITY */
app.patch("/api/orders/:id", requireStaff, async (req, res) => {
  const allowed = ["pending", "cooking", "ready", "completed"];

  if (!allowed.includes(req.body.status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  order.status = req.body.status;
  await order.save();

  io.emit("order:update", order);
  res.json(order);
});



app.post(
  "/api/menu/upload",
  requireCashier,
  upload.single("image"),
  (req, res) => {
    res.json({
      imageUrl: req.file.path, // Cloudinary URL
    });
  }
);

/* ================= HEALTH ================= */
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

/* ================= START ================= */
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

/* ================= ANALYTICS ================= */

/* TODAY SALES SUMMARY */
app.get("/api/analytics/today", requireCashier, async (req, res) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const orders = await Order.find({
      status: "completed",
      createdAt: { $gte: start, $lte: end }
    });

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);

    res.json({
      totalOrders,
      totalRevenue
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: "Analytics failed" });
  }
});
