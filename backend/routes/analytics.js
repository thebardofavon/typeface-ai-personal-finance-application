const express = require("express");
const multer = require("multer");
const Tesseract = require("tesseract.js");
const { Transaction, Category, Op, sequelize } = require("../db");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const parseReceiptText = (text) => {
  let merchant = "Unknown Merchant";
  let total = null;
  let date = null;

  const lines = text.split("\n");

  for (const line of lines) {
    if (line.trim().length > 0) {
      merchant = line.trim();
      break;
    }
  }

  const totalRegex = /(?:total|amount|due|balance)[\s:]*[$€£]?\s*(\d+\.\d{2})/i;
  const totalMatch = text.match(totalRegex);
  if (totalMatch && totalMatch[1]) {
    total = parseFloat(totalMatch[1]);
  } else {
    const numbers = text.match(/\d+\.\d{2}/g) || [];
    const amounts = numbers.map(parseFloat);
    if (amounts.length > 0) {
      total = Math.max(...amounts);
    }
  }

  const dateRegex = /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|(\d{4}-\d{2}-\d{2})/;
  const dateMatch = text.match(dateRegex);
  if (dateMatch && (dateMatch[1] || dateMatch[2])) {
    const parsedDate = new Date(dateMatch[1] || dateMatch[2]);
    if (!isNaN(parsedDate)) {
      date = parsedDate.toISOString().slice(0, 10);
    }
  }

  if (!date) {
    date = new Date().toISOString().slice(0, 10);
  }

  return { merchant, total, date };
};

router.post(
  "/receipt",
  upload.single("receipt"),
  async (req, res) => {
    req.setTimeout(300000);

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }

    let worker;

    try {
      console.log(
        `Processing file: ${req.file.originalname} with Tesseract.js...`,
      );

      worker = await Tesseract.createWorker("eng");

      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      });

      const {
        data: { text },
      } = await worker.recognize(req.file.buffer);

      console.log("OCR Raw Output:\n", text);

      const extractedData = parseReceiptText(text);

      res.json({
        message: "Receipt processed successfully",
        extractedData,
      });
    } catch (error) {
      console.error("OCR Processing Error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          message: "Failed to process receipt.",
          error: error.message,
        });
      }
    } finally {
      if (worker) {
        await worker.terminate();
      }
    }
  },
);

router.get("/summary", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.user.id;

    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter.transactionDate = { [Op.between]: [startDate, endDate] };
    }

    const expensesByCategory = await Transaction.findAll({
      attributes: [
        [sequelize.col("Category.name"), "category"],
        [sequelize.fn("SUM", sequelize.col("amount")), "total"],
      ],
      include: [
        { model: Category, attributes: [], where: { type: "expense" } },
      ],
      where: { UserId: userId, ...dateFilter },
      group: ["Category.name"],
      raw: true,
    });

    const incomeVsExpense = await Transaction.findAll({
      where: { UserId: userId, ...dateFilter },
      attributes: [
        [sequelize.col("Category.type"), "type"],
        [sequelize.fn("SUM", sequelize.col("amount")), "totalAmount"],
      ],
      include: [{ model: Category, attributes: [] }],
      group: [sequelize.col("Category.type")],
      raw: true,
    });

    const expensesOverTime = await Transaction.findAll({
      where: { UserId: userId, ...dateFilter },
      include: [
        { model: Category, attributes: [], where: { type: "expense" } },
      ],
      attributes: [
        [sequelize.fn("DATE", sequelize.col("transactionDate")), "date"],
        [sequelize.fn("SUM", sequelize.col("amount")), "totalAmount"],
      ],
      group: [sequelize.fn("DATE", sequelize.col("transactionDate"))],
      order: [[sequelize.fn("DATE", sequelize.col("transactionDate")), "ASC"]],
      raw: true,
    });

    res.json({ expensesByCategory, incomeVsExpense, expensesOverTime });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching analytics summary",
      error: error.message,
    });
  }
});

module.exports = router;
