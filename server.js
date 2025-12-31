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
const server = http.createServer(app);

/* ================= CONFIG ================= */
const PORT = process.env.PORT;
const isProd = process.env.NODE_ENV === "production";

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

app.patch("/api/orders/:id", requireCashier, async (req, res) => {
  const allowed = ["pending", "cooking", "ready", "completed"];
  if (!allowed.includes(req.body.status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  order.status = req.body.status;
  await order.save();

  io.emit("order:update", order);
  res.json(order);
});

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
app.patch("/api/menu/:id", requireCashier, async (req, res) => {
  const { available } = req.body;

  const item = await MenuItem.findByIdAndUpdate(
    req.params.id,
    { available },
    { new: true }
  );

  io.emit("menu:update");
  res.json(item);
});

/* ================= HEALTH ================= */
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

/* ================= START ================= */
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
