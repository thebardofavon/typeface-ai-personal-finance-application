const { Sequelize, DataTypes } = require("sequelize");

const sequelize = new Sequelize("sqlite://money.db");

const User = sequelize.define("User", {
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: { isEmail: true },
  },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
});

const Category = sequelize.define(
  "Category",
  {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM("income", "expense"),
      allowNull: false,
    },
    UserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Users",
        key: "id",
      },
    },
  },
  {
    indexes: [
      {
        unique: true,
        fields: ["name", "UserId"],
      },
    ],
  },
);

const Transaction = sequelize.define("Transaction", {
  description: { type: DataTypes.STRING, allowNull: false },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  transactionDate: { type: DataTypes.DATEONLY, allowNull: false },
});

User.hasMany(Transaction);
Transaction.belongsTo(User);

User.hasMany(Category);
Category.belongsTo(User);

Category.hasMany(Transaction);
Transaction.belongsTo(Category);

module.exports = {
  sequelize,
  User,
  Category,
  Transaction,
  Op: Sequelize.Op,
};
