// src/models/zones.js
module.exports = (sequelize, DataTypes) => {
  const Zone = sequelize.define(
    "Zone",
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: null },
      code: { type: DataTypes.TEXT, allowNull: false, unique: true },
      name: { type: DataTypes.TEXT, allowNull: false },
      floor: { type: DataTypes.TEXT },
      map_ref: { type: DataTypes.TEXT },
      created_at: { type: DataTypes.DATE },
      updated_at: { type: DataTypes.DATE },
    },
    {
      tableName: "zones",
      schema: "firecore",
      underscored: true,
      timestamps: false,
    }
  );
  return Zone;
};
