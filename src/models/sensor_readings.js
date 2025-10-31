// src/models/sensor_readings.js
// Bảng partitioned theo tháng — Sequelize vẫn thao tác như bảng thường.
module.exports = (sequelize, DataTypes) => {
  const SensorReading = sequelize.define(
    "SensorReading",
    {
      id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        primaryKey: true,
        autoIncrementIdentity: true,
      },
      sensor_id: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
      reading_ts: { type: DataTypes.DATE, allowNull: false, primaryKey: true },
      smoke_ppm: { type: DataTypes.DECIMAL(10, 3) },
      temp_c: { type: DataTypes.DECIMAL(6, 2) },
      co2_ppm: { type: DataTypes.DECIMAL(10, 2) },
      payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      quality_score: {
        type: DataTypes.SMALLINT,
        allowNull: false,
        defaultValue: 100,
      },
      created_at: { type: DataTypes.DATE },
    },
    {
      tableName: "sensor_readings",
      schema: "firecore",
      underscored: true,
      timestamps: false,
    }
  );
  return SensorReading;
};
