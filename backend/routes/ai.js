const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Transaction, Category } = require("../db");

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

router.post("/chat", async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Query is required." });
  }
  const userId = req.user.id;

  try {
    const transactions = await Transaction.findAll({
      where: { UserId: userId },
      include: Category,
      order: [["transactionDate", "DESC"]],
      limit: 50,
    });

    if (transactions.length === 0) {
      return res.json({
        response:
          "I don't have any transaction data to analyze yet. Please add some transactions first!",
      });
    }

    const context =
      "User's recent transactions:\n" +
      transactions
        .map((t) => {
          const categoryName = t.Category?.name ?? "Uncategorized";
          const categoryType = t.Category?.type ?? "expense";

          return `- Date: ${t.transactionDate}, Description: ${t.description}, Amount: ${t.amount}, Category: ${categoryName} (${categoryType})`;
        })
        .join("\n");

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const prompt = `You are a helpful and concise personal finance assistant. Analyze the following user transaction data to answer their question. Provide actionable insights but do not give financial advice. Base your answer ONLY on the data provided.

        --- TRANSACTION DATA ---
        ${context}
        ------------------------

        USER QUESTION: "${query}"

        YOUR ANALYSIS:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    res.json({ response: text });
  } catch (error) {
    console.error("AI chat error:", error);
    res.status(500).json({ error: "Failed to get AI response." });
  }
});

module.exports = router;
