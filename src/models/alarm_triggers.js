// src/models/alarm_triggers.js
module.exports = (sequelize, DataTypes) => {
  const AlarmTrigger = sequelize.define(
    "AlarmTrigger",
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      event_id: { type: DataTypes.UUID, allowNull: false },
      zone_id: { type: DataTypes.UUID, allowNull: false },
      status: {
        type: DataTypes.ENUM("active", "silenced", "reset"),
        allowNull: false,
        defaultValue: "active",
      },
      triggered_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      deactivated_at: { type: DataTypes.DATE },
      details: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE },
    },
    {
      tableName: "alarm_triggers",
      schema: "firecore",
      underscored: true,
      timestamps: false,
    }
  );
  return AlarmTrigger;
};
