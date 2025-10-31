// src/models/fire_events.js
module.exports = (sequelize, DataTypes) => {
  const FireEvent = sequelize.define(
    "FireEvent",
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: null },
      zone_id: { type: DataTypes.UUID, allowNull: false },
      suspected_at: { type: DataTypes.DATE, allowNull: false },
      confirmed_at: { type: DataTypes.DATE },
      cleared_at: { type: DataTypes.DATE },
      state: {
        type: DataTypes.ENUM("suspected", "confirmed", "cleared"),
        allowNull: false,
      },
      severity: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 1 },
      correlation: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      summary: { type: DataTypes.TEXT },
      created_at: { type: DataTypes.DATE },
      updated_at: { type: DataTypes.DATE },
    },
    {
      tableName: "fire_events",
      schema: "firecore",
      underscored: true,
      timestamps: false,
    }
  );
  return FireEvent;
};
