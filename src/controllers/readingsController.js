// src/controllers/readingController.js
const { SensorReading } = require('../models/index');

const ruleService = require('./ruleService');
// 🟢 Lấy toàn bộ readings
exports.getAllReadings = async (req, res) => {
  try {
    const readings = await SensorReading.findAll({
      order: [['created_at', 'DESC']],
    });
    res.status(200).json({
      status: 200,
      message: 'Lấy dữ liệu thành công',
      data: readings,
    });
  } catch (error) {
    console.error('Error fetching sensor readings:', error);
    res.status(500).json({
      message: 'Error fetching sensor readings',
      error: error.message,
    });
  }
};

// 🟡 Lấy reading theo ID
exports.getReadingById = async (req, res) => {
  try {
    const { id } = req.params;
    const reading = await SensorReading.findByPk(id); // ✅ Sequelize dùng findByPk

    if (!reading) {
      return res.status(404).json({ message: 'Reading not found' });
    }

    res.status(200).json({
      status: 200,
      message: 'Lấy dữ liệu thành công',
      data: reading,
    });
  } catch (error) {
    console.error('Error fetching reading:', error);
    res.status(500).json({
      message: 'Error fetching reading',
      error: error.message,
    });
  }
};

// 🟢 Thêm mới reading
exports.createReading = async (req, res) => {
  try {
    const { sensor_id, temp_c, co2_ppm, smoke_ppm, timestamp, payload } = req.body;
    if (!sensor_id) return res.status(400).json({ message: 'sensor_id is required' });

    const newReading = await SensorReading.create({
      sensor_id,
      temp_c,
      co2_ppm,
      smoke_ppm,
      reading_ts: timestamp || new Date(),
      payload: payload || {},
    });

    // B2: Kích hoạt "cầu nối" (Rule Engine)
    // *** KHÔNG CẦN 'await' ***
    // Chúng ta trả về 201 ngay, và để service tự chạy trong nền.
    ruleService.processReading(newReading);

    // B3: Trả về thành công cho cảm biến (form fake)
    res.status(201).json({ message: 'Reading created successfully', data: newReading });

  } catch (error) {
    console.error('Error creating reading:', error);
    res.status(400).json({ message: 'Error creating reading', error: error.message });
  }
};

// 🔴 Xóa reading theo ID
exports.deleteReading = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await SensorReading.destroy({
      where: { id },
    });

    if (!deleted) {
      return res.status(404).json({ message: 'Reading not found' });
    }

    res.status(200).json({
      status: 200,
      message: 'Reading deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting reading:', error);
    res.status(500).json({
      message: 'Error deleting reading',
      error: error.message,
    });
  }
};
