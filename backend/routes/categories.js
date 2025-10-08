const express = require("express");
const { Category, Transaction, Op } = require("../db");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { name, type } = req.body;
    const category = await Category.create({ name, type, UserId: req.user.id });
    res.status(201).json(category);
  } catch (error) {
    if (error.message && error.message.includes("UNIQUE constraint failed")) {
      return res
        .status(409)
        .json({ message: "A category with this name already exists." });
    }
    res
      .status(500)
      .json({ message: "Error creating category", error: error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const categories = await Category.findAll({
      where: { UserId: req.user.id },
    });
    res.json(categories);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching categories", error: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { name } = req.body;
    const category = await Category.findOne({
      where: { id: req.params.id, UserId: req.user.id },
    });

    if (!category) {
      return res.status(404).json({
        message: "Category not found or you don't have permission to edit it.",
      });
    }

    const existingCategory = await Category.findOne({
      where: {
        name,
        UserId: req.user.id,
        id: { [Op.ne]: req.params.id },
      },
    });

    if (existingCategory) {
      return res
        .status(409)
        .json({ message: "A category with this name already exists." });
    }

    category.name = name;
    await category.save();
    res.json(category);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating category", error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const category = await Category.findOne({
      where: { id: req.params.id, UserId: req.user.id },
    });

    if (!category) {
      return res.status(404).json({
        message:
          "Category not found or you don't have permission to delete it.",
      });
    }

    const transactionCount = await Transaction.count({
      where: { CategoryId: req.params.id },
    });

    if (transactionCount > 0) {
      return res.status(409).json({
        message: `Cannot delete category. It is associated with ${transactionCount} transaction(s). Please re-assign them first.`,
      });
    }

    await category.destroy();
    res.status(204).send();
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting category", error: error.message });
  }
});

module.exports = router;
