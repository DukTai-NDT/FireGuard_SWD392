// === PHẦN IMPORT (ĐẦU FILE) ===
// (Đã bổ sung tất cả các model cần thiết cho cả 2 hàm)
const { Op } = require('sequelize');
const {  // <-- Thêm từ file kia
  DetectionPolicy, // <-- Bổ sung
  SystemLog,       // <-- Bổ sung
  FireEvent,       // <-- Bổ sung
  Sensor,
  AlarmTrigger,
  SensorReading,
  Zone     // <-- Bổ sung
} = require('../models/index');


/**
 * UC15 - Lấy dữ liệu cho Timeline Replay (Hàm Gốc Của Bạn)
 */
exports.getIncidentTimeline = async (req, res) => {
  try {
    const { eventId } = req.params;

    // 1. Lấy sự cố (fire_event)
    const incident = await FireEvent.findByPk(eventId, {
      // Yêu cầu Sequelize JOIN với bảng 'zones'
      include: [{
        model: Zone, // <--- Thêm model Zone
        attributes: ['name', 'floor'] // Chỉ lấy 2 cột này
      }]
    });
    if (!incident) {
      return res.status(404).json({ message: 'Incident (Event) not found' });
    }

    // 2. Xác định khoảng thời gian và không gian
    const startTime = incident.suspected_at;
    const endTime = incident.cleared_at || new Date(); // Nếu chưa kết thúc, lấy đến hiện tại
    const zoneId = incident.zone_id;

    // 3. Lấy tất cả sensor ID trong khu vực đó
    const sensorsInZone = await Sensor.findAll({
      where: { zone_id: zoneId },
      attributes: ['id'],
      raw: true,
    });
    const sensorIds = sensorsInZone.map((s) => s.id);

    // 4. Lấy song song (Promise.all) tất cả các luồng dữ liệu liên quan
    const [logs, alarms, readings] = await Promise.all([
      // Luồng 1: System Logs
      SystemLog.findAll({
        where: { event_id: eventId },
        raw: true,
      }),
      // Luồng 2: Alarm Triggers
      AlarmTrigger.findAll({
        where: { event_id: eventId },
        raw: true,
      }),
      // Luồng 3: Sensor Readings (trong zone và trong khoảng thời gian)
      SensorReading.findAll({
        where: {
          sensor_id: { [Op.in]: sensorIds },
          reading_ts: { [Op.between]: [startTime, endTime] },
        },

        include: [{
            model: Sensor,
            attributes: ['serial_number'] // Chỉ lấy serial_number
        }],
        order: [['reading_ts', 'ASC']],
        raw: true,
        nest: true
      }),
    ]);

    // 5. Chuẩn hóa, Gộp (Merge) và Sắp xếp (Sort)
    const timelineLogs = logs.map((log) => ({
      type: 'log',
      timestamp: log.ts,
      data: log,
    }));

    const timelineReadings = readings.map((r) => ({
      type: 'reading',
      timestamp: r.reading_ts,
      data: r,
    }));

    const timelineAlarms = [];
    alarms.forEach((alarm) => {
      timelineAlarms.push({
        type: 'alarm_triggered',
        timestamp: alarm.triggered_at,
        data: alarm,
      });
      if (alarm.deactivated_at) {
        timelineAlarms.push({
          type: 'alarm_deactivated',
          timestamp: alarm.deactivated_at,
          data: alarm,
        });
      }
    });

    // 6. Gộp tất cả và Sắp xếp
    const fullTimeline = [
      ...timelineLogs,
      ...timelineReadings,
      ...timelineAlarms,
    ];

    fullTimeline.sort((a, b) => a.timestamp - b.timestamp);

    res.status(200).json({
      status: 200,
      message: 'Lấy dữ liệu timeline thành công',
      incident: incident, // Gửi thông tin sự cố chính
      timeline: fullTimeline, // Gửi mảng sự kiện đã sắp xếp
    });

  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ message: 'Error fetching timeline', error: error.message });
  }
};


/**
 * HÀM MỚI: "Đóng" (Clear) một sự cố
 * API: PUT /api/timeline/incident/:eventId/clear
 */
exports.clearEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    // 1. Tìm sự cố
    const incident = await FireEvent.findByPk(eventId);
    if (!incident) {
      return res.status(404).json({ message: 'Incident (Event) not found' });
    }

    // 2. Cập nhật trạng thái sự cố
    await incident.update({
      state: 'cleared',
      cleared_at: new Date()
    });

    // 3. (Quan trọng) Tắt (reset) tất cả chuông báo (alarm) đang active
    await AlarmTrigger.update(
      {
        status: 'reset',
        deactivated_at: new Date()
      },
      {
        where: {
          event_id: eventId,
          status: 'active' // Chỉ tắt những chuông đang kêu
        }
      }
    );

    // 4. Ghi Log (UC14) về hành động này
    await SystemLog.create({
      level: 'info',
      message: 'Event cleared by user [admin]',
      ctx: { user: 'admin', action: 'clear' },
      event_id: eventId
    });

    console.log(`Sự cố ${eventId} đã được đóng (cleared).`);

    res.status(200).json({
      status: 200,
      message: 'Event cleared successfully',
      data: incident // Trả về sự cố đã được cập nhật
    });

  } catch (error) {
    console.error('Error clearing event:', error);
    res.status(500).json({ message: 'Error clearing event', error: error.message });
  }
};