// src/models/sensors.js
module.exports = (sequelize, DataTypes) => {
  const Sensor = sequelize.define(
    "Sensor",
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: null },
      serial_number: { type: DataTypes.TEXT, allowNull: false, unique: true },
      type: {
        type: DataTypes.ENUM("smoke", "temperature", "co2"),
        allowNull: false,
      },
      zone_id: { type: DataTypes.UUID, allowNull: false },
      location_note: { type: DataTypes.TEXT },
      map_x: { type: DataTypes.DECIMAL(5, 4) },
      map_y: { type: DataTypes.DECIMAL(5, 4) },
      thresholds: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      installed_at: { type: DataTypes.DATE },
      last_seen_at: { type: DataTypes.DATE },
      created_at: { type: DataTypes.DATE },
      updated_at: { type: DataTypes.DATE },
    },
    {
      tableName: "sensors",
      schema: "firecore",
      underscored: true,
      timestamps: false,
    }
  );
  return Sensor;
};
