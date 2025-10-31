// src/models/detection_policies.js
module.exports = (sequelize, DataTypes) => {
  const DetectionPolicy = sequelize.define(
    "DetectionPolicy",
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: null },
      scope: { type: DataTypes.TEXT, allowNull: false }, // 'global' | 'zone' | 'sensor'
      zone_id: { type: DataTypes.UUID, allowNull: true },
      sensor_id: { type: DataTypes.UUID, allowNull: true },
      rules: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {
          window_sec: 120,
          smoke_ppm: 70,
          temp_c: 60,
          co2_ppm: 1200,
          need_concurrence: 2,
        },
      },
      auto_reset_sec: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 180,
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: { type: DataTypes.DATE },
      updated_at: { type: DataTypes.DATE },
    },
    {
      tableName: "detection_policies",
      schema: "firecore",
      underscored: true,
      timestamps: false,
    }
  );
  return DetectionPolicy;
};
