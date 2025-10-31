// src/models/index.js
const Sequelize = require("sequelize");
const sequelize = require("../../config/dbConfig");

// import per-file
const Zone = require("./zones")(sequelize, Sequelize.DataTypes);
const Sensor = require("./sensors")(sequelize, Sequelize.DataTypes);
const DetectionPolicy = require("./detection_policies")(
  sequelize,
  Sequelize.DataTypes
);
const SensorReading = require("./sensor_readings")(
  sequelize,
  Sequelize.DataTypes
);
const FireEvent = require("./fire_events")(sequelize, Sequelize.DataTypes);
const AlarmTrigger = require("./alarm_triggers")(
  sequelize,
  Sequelize.DataTypes
);
const SystemLog = require("./system_logs")(sequelize, Sequelize.DataTypes);

/* =========================
   Associations
   ========================= */

// zones (1) — (n) sensors
Zone.hasMany(Sensor, { foreignKey: "zone_id" });
Sensor.belongsTo(Zone, { foreignKey: "zone_id" });

// detection_policies → optional links
Zone.hasMany(DetectionPolicy, { foreignKey: "zone_id" });
DetectionPolicy.belongsTo(Zone, { foreignKey: "zone_id" });

Sensor.hasMany(DetectionPolicy, { foreignKey: "sensor_id" });
DetectionPolicy.belongsTo(Sensor, { foreignKey: "sensor_id" });

// sensors (1) — (n) sensor_readings
Sensor.hasMany(SensorReading, { foreignKey: "sensor_id" });
SensorReading.belongsTo(Sensor, { foreignKey: "sensor_id" });

// zones (1) — (n) fire_events
Zone.hasMany(FireEvent, { foreignKey: "zone_id" });
FireEvent.belongsTo(Zone, { foreignKey: "zone_id" });

// fire_events (1) — (n) alarm_triggers
FireEvent.hasMany(AlarmTrigger, { foreignKey: "event_id" });
AlarmTrigger.belongsTo(FireEvent, { foreignKey: "event_id" });

// zones (1) — (n) alarm_triggers (denormalized để query nhanh)
Zone.hasMany(AlarmTrigger, { foreignKey: "zone_id" });
AlarmTrigger.belongsTo(Zone, { foreignKey: "zone_id" });

// system_logs → optional refs
FireEvent.hasMany(SystemLog, { foreignKey: "event_id" });
SystemLog.belongsTo(FireEvent, { foreignKey: "event_id" });

Sensor.hasMany(SystemLog, { foreignKey: "sensor_id" });
SystemLog.belongsTo(Sensor, { foreignKey: "sensor_id" });

module.exports = {
  sequelize,
  Sequelize,
  Zone,
  Sensor,
  DetectionPolicy,
  SensorReading,
  FireEvent,
  AlarmTrigger,
  SystemLog,
};
