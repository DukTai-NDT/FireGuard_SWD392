// src/models/system_logs.js
module.exports = (sequelize, DataTypes) => {
  const SystemLog = sequelize.define(
    "SystemLog",
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      ts: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      level: { type: DataTypes.TEXT, allowNull: false }, // 'debug' | 'info' | 'warn' | 'error'
      message: { type: DataTypes.TEXT, allowNull: false },
      ctx: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      event_id: { type: DataTypes.UUID, allowNull: true },
      sensor_id: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: "system_logs",
      schema: "firecore",
      underscored: true,
      timestamps: false,
    }
  );
  return SystemLog;
};
