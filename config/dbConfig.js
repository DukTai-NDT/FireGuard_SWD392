// config/db.js - Sequelize Postgres connection
const { Sequelize } = require("sequelize");
require("dotenv").config();

const dbHost = process.env.DB_HOST || "localhost";
const dbPort = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432;
const dbName = process.env.DB_NAME || "fireguard_db";
const dbUser = process.env.DB_USER || "postgres";
const dbPassword = process.env.DB_PASSWORD || "";
const dbSSL = (process.env.DB_SSL || "false") === "true";

const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
  host: dbHost,
  port: dbPort,
  dialect: "postgres",
  dialectOptions: dbSSL
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : {},
  define: {
    underscored: true,
    timestamps: false,
    freezeTableName: false,
  },
  logging: false,
});

module.exports = sequelize;
