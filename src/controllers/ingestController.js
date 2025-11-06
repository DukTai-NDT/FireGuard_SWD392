const { SensorReading } = require("../models");

exports.ingestSensorData = async (req, res, next) => {
    try {
        const { sensor_id, smoke_ppm, temp_c, co2_ppm, reading_ts, payload } = req.body;

        // Kiểm tra đầu vào
        if (!sensor_id || !reading_ts) {
            return res.status(400).json({
                message: "Missing required fields: sensor_id or reading_ts",
            });
        }

        // Tạo dữ liệu cảm biến mới
        const newReading = await SensorReading.create({
            sensor_id,
            smoke_ppm: smoke_ppm ?? null,
            temp_c: temp_c ?? null,
            co2_ppm: co2_ppm ?? null,
            reading_ts: new Date(reading_ts),
            payload: payload || {},
            created_at: new Date(),
        });

        res.status(201).json({
            message: "Sensor data stored successfully",
            data: newReading,
        });
    } catch (error) {
        next(error);
    }
};
