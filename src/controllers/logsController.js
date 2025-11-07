const { SystemLog } = require('../models/index');
const { Op } = require('sequelize');
// Lấy toàn bộ logs
exports.getAllLogs = async (req, res) => {
  try {
    // === Phân trang ===
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;

    // === Lọc ===
    const { level, eventId, sensorId, startDate, endDate } = req.query;
    let whereClause = {};

    if (level) whereClause.level = level;
    if (eventId) whereClause.event_id = eventId;
    if (sensorId) whereClause.sensor_id = sensorId;

    // Lọc theo khoảng thời gian (rất quan trọng cho log)
    if (startDate && endDate) {
      whereClause.ts = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    } else if (startDate) {
      whereClause.ts = { [Op.gte]: new Date(startDate) };
    } else if (endDate) {
      whereClause.ts = { [Op.lte]: new Date(endDate) };
    }

    // === Query ===
    const { count, rows } = await SystemLog.findAndCountAll({
      where: whereClause,
      order: [['ts', 'DESC']], // Schema của bạn dùng 'ts' (Table 2.7)
      limit: limit,
      offset: offset,
      raw: true, // Tăng tốc độ query
    });

    res.status(200).json({
      status: 200,
      message: 'Lấy dữ liệu log thành công',
      totalItems: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      data: rows,
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ message: 'Error fetching logs', error: error.message });
  }
};

// Lấy log theo ID
exports.getLogById = async (req, res) => {
  try {
    const log = await SystemLog.findByPk(req.params.id);
    if (!log) {
      return res.status(404).json({ message: 'Log not found' });
    }
    res.status(200).json(log);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching log', error: error.message });
  }
};

// Tạo mới log
/**
 * UC14 - Phần 1: Tạo Log (Giữ nguyên)
 * (Hàm này được các service khác gọi)
 */
exports.createLog = async (req, res) => {
  try {
    const newLog = await SystemLog.create(req.body);
    res.status(201).json({
      status: 201,
      data: newLog,
      message: 'Tạo log thành công',
    });
  } catch (error) {
    res.status(400).json({ message: 'Error creating log', error: error.message });
  }
};

// Xóa log
exports.deleteLog = async (req, res) => {
  try {
    const deleted = await SystemLog.destroy({ where: { id: req.params.id } });
    if (!deleted) {
      return res.status(404).json({ message: 'Log not found' });
    }
    res.status(200).json({ message: 'Log deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting log', error: error.message });
  }
};
