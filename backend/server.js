require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { sequelize } = require("./db");

const authRoutes = require("./routes/auth");
const categoryRoutes = require("./routes/categories");
const transactionRoutes = require("./routes/transactions");
const aiRoutes = require("./routes/ai");
const analyticsRoutes = require("./routes/analytics");

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) {
    return res
      .status(401)
      .json({ message: "Authentication token is required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Token is invalid or expired" });
    }
    req.user = user;
    next();
  });
};

app.use("/api/auth", authRoutes);
app.use("/api/categories", authenticateToken, categoryRoutes);
app.use("/api/transactions", authenticateToken, transactionRoutes);
app.use("/api/ai", authenticateToken, aiRoutes);
app.use("/api/analytics", authenticateToken, analyticsRoutes);
app.use("/api/upload", authenticateToken, analyticsRoutes);


const startServer = async () => {
  try {
    await sequelize.sync();
    console.log("Database synchronized successfully.");

    app.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Unable to connect to the database:", error);
  }
};

startServer();
