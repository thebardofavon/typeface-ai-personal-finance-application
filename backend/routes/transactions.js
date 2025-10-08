const express = require("express");
const multer = require("multer");
const pdf = require("pdf-parse");
const dayjs = require("dayjs");
const Tesseract = require("tesseract.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Transaction, Category, Op, sequelize } = require("../db");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

router.post("/", async (req, res) => {
  try {
    const { description, amount, transactionDate, categoryId } = req.body;
    const transaction = await Transaction.create({
      description,
      amount,
      transactionDate,
      CategoryId: categoryId,
      UserId: req.user.id,
    });
    res.status(201).json(transaction);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating transaction", error: error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter.transactionDate = { [Op.between]: [startDate, endDate] };
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    const { count, rows } = await Transaction.findAndCountAll({
      where: {
        UserId: req.user.id,
        ...dateFilter,
      },
      include: Category,
      order: [["transactionDate", "DESC"]],
      limit,
      offset,
    });

    res.json({
      totalItems: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      transactions: rows,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching transactions", error: error.message });
  }
});

router.post("/upload-pdf", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No PDF file uploaded." });
  }

  try {
    const dataBuffer = req.file.buffer;
    const pdfData = await pdf(dataBuffer);
    const text = pdfData.text;

    let defaultCategory = await Category.findOne({
      where: { UserId: req.user.id, type: "expense" },
    });

    if (!defaultCategory) {
      defaultCategory = await Category.create({
        name: "Uncategorized",
        type: "expense",
        UserId: req.user.id,
      });
    }
    const defaultCategoryId = defaultCategory.id;

    const lines = text.split("\n");
    const transactionsToCreate = [];
    let importedCount = 0;
    let duplicateCount = 0;

    const transactionRegex = /(\d{2}\/\d{2}\/\d{4})\s+(.*?)\s+([\d,]+\.\d{2})/;

    for (const line of lines) {
      const match = line.match(transactionRegex);
      if (match) {
        const [_, dateStr, description, amountStr] = match;

        const customParseFormat = require("dayjs/plugin/customParseFormat");
        dayjs.extend(customParseFormat);
        const date = dayjs(dateStr, "MM/DD/YYYY").format("YYYY-MM-DD");

        const amount = parseFloat(amountStr.replace(/,/g, ""));
        const trimmedDesc = description.trim();

        const existing = await Transaction.findOne({
          where: {
            UserId: req.user.id,
            transactionDate: date,
            amount,
            description: trimmedDesc,
          },
        });

        if (!existing) {
          transactionsToCreate.push({
            transactionDate: date,
            description: trimmedDesc,
            amount,
            CategoryId: defaultCategoryId,
            UserId: req.user.id,
          });
          importedCount++;
        } else {
          duplicateCount++;
        }
      }
    }

    if (transactionsToCreate.length > 0) {
      await Transaction.bulkCreate(transactionsToCreate);
    }

    res.status(201).json({
      message: "PDF processed successfully.",
      imported: importedCount,
      duplicates: duplicateCount,
    });
  } catch (error) {
    console.error("PDF parsing error:", error);
    res.status(500).json({ error: "Failed to parse PDF." });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { description, amount, transactionDate, categoryId } = req.body;
    const transaction = await Transaction.findOne({
      where: { id: req.params.id, UserId: req.user.id },
    });

    if (!transaction) {
      return res.status(404).json({
        message:
          "Transaction not found or you do not have permission to edit it.",
      });
    }

    await transaction.update({
      description,
      amount,
      transactionDate,
      CategoryId: categoryId,
    });

    res.json(transaction);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating transaction", error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      where: { id: req.params.id, UserId: req.user.id },
    });

    if (!transaction) {
      return res.status(404).json({
        message:
          "Transaction not found or you do not have permission to delete it.",
      });
    }

    await transaction.destroy();
    res.status(204).send();
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting transaction", error: error.message });
  }
});

module.exports = router;
