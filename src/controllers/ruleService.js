const { Op } = require('sequelize');
const {
    DetectionPolicy,
    SystemLog,
    FireEvent,
    Sensor,
    AlarmTrigger // <-- SỬA 1: Bổ sung model AlarmTrigger
} = require('../models/index');


/**
 * Xử lý một bản ghi (reading) mới để kiểm tra vi phạm quy tắc.
 * Đây là "Rule Engine" (Cầu nối) bị thiếu.
 * @param {object} reading - Đối tượng SensorReading vừa được tạo.
 */
async function processReading(reading) {
    const { sensor_id, smoke_ppm, temp_c, co2_ppm } = reading;

    try {
        // B1: Lấy quy tắc (policy)
        const policy = await DetectionPolicy.findOne({ where: { scope: 'global' } });
        if (!policy) {
            console.error("Lỗi Rule Engine: Không tìm thấy 'global policy'.");
            return;
        }
        
        const thresholds = policy.rules; // { smoke_ppm: 70, temp_c: 60, ... }
        let isBreach = false;
        let breachDetails = {};

        // B2: So sánh giá trị với ngưỡng
        if (smoke_ppm && smoke_ppm > thresholds.smoke_ppm) {
            isBreach = true;
            breachDetails = { type: 'smoke', value: smoke_ppm, threshold: thresholds.smoke_ppm };
        } else if (temp_c && temp_c > thresholds.temp_c) {
            isBreach = true;
            breachDetails = { type: 'temperature', value: temp_c, threshold: thresholds.temp_c };
        } else if (co2_ppm && co2_ppm > thresholds.co2_ppm) {
            isBreach = true;
            breachDetails = { type: 'co2', value: co2_ppm, threshold: thresholds.co2_ppm };
        }

        // B3: Nếu không vi phạm, dừng lại
        if (!isBreach) {
            return; 
        }

        // B4: NẾU CÓ VI PHẠM (Rule Hit)
        console.warn(`RULE HIT: Cảm biến ${sensor_id} vi phạm ngưỡng ${breachDetails.type}`);

        const sensor = await Sensor.findByPk(sensor_id);
        if (!sensor) return;

        let activeEvent = await FireEvent.findOne({
            where: {
                zone_id: sensor.zone_id,
                state: { [Op.in]: ['suspected', 'confirmed'] }
            }
        });

        // B5: Xử lý sự cố
        if (!activeEvent) {
            // == TRƯỜNG HỢP 1: VI PHẠM ĐẦU TIÊN (Tạo sự cố mới) ==
            console.log("Tạo sự cố (FireEvent) mới (suspected)...");
            activeEvent = await FireEvent.create({
                zone_id: sensor.zone_id,
                suspected_at: new Date(),
                state: 'suspected',
                severity: 1,
                summary: `Initial detection from sensor ${sensor.serial_number} (${breachDetails.type})`
            });

            // GHI LOG 'warn' (UC14) cho việc tạo sự cố
            await SystemLog.create({
                level: 'warn', // <-- MỨC WARN
                message: `New fire event created (suspected)`,
                ctx: { 
                    reason: `Sensor ${sensor.serial_number} breached threshold`, 
                    serial_number: sensor.serial_number, // <-- SỬA 3: Thêm serial_number
                    ...breachDetails 
                },
                event_id: activeEvent.id,
                sensor_id: sensor_id
            });

        } else if (activeEvent.state === 'suspected') {
            // == TRƯỜG HỢP 2: ĐÃ 'SUSPECTED', NÂNG CẤP LÊN 'CONFIRMED' ==
            // (Giả định rằng 'need_concurrence: 2' đã được đáp ứng)
            
            console.log("Nâng cấp sự cố lên (confirmed)...");
            
            // Cập nhật sự cố (Event)
            await activeEvent.update({
                state: 'confirmed',
                confirmed_at: new Date(),
                severity: 2,
                summary: activeEvent.summary + ` | Correlated by ${sensor.serial_number} (${breachDetails.type})`
            });

            // GHI LOG 'ERROR' (UC14) CHO VIỆC XÁC NHẬN
            await SystemLog.create({
                level: 'error', // <-- MỨC ERROR 
                message: 'Fire event confirmed by correlation',
                ctx: { 
                    reason: `Second sensor breach detected`, 
                    serial_number: sensor.serial_number, // <-- SỬA 3: Thêm serial_number
                    ...breachDetails 
                },
                event_id: activeEvent.id,
                sensor_id: sensor_id
            });

            
            // === SỬA 2: THÊM LOGIC KÍCH HOẠT CHUÔNG BÁO (UC14) ===
            console.log("Kích hoạt chuông báo (AlarmTrigger)...");

            // 2a. Tạo bản ghi AlarmTrigger (để bật chuông)
            const newAlarm = await AlarmTrigger.create({
                event_id: activeEvent.id,
                zone_id: activeEvent.zone_id,
                status: 'active',
                details: { trigger: `Correlation by ${sensor.serial_number}` }
            });

            // 2b. Ghi log "Chuông reo" (để FE hiển thị)
            await SystemLog.create({
                level: 'error', // Cấp độ cao nhất
                message: `ALARM ACTIVATED for zone ${activeEvent.zone_id}`,
                ctx: { 
                    reason: `Event confirmed by 2nd sensor`,
                    serial_number: sensor.serial_number, // <-- SỬA 3
                    alarm_id: newAlarm.id 
                },
                event_id: activeEvent.id,
                sensor_id: sensor_id
            });
            // === KẾT THÚC SỬA 2 ===
        }
        // (Nếu sự cố đã 'confirmed' rồi thì không cần làm gì thêm, chỉ ghi log 'Rule Hit' bên dưới)


        // B6: GHI LOG 'warn' (UC14) cho chính vi phạm (Rule Hit) này
        // (Log này luôn được ghi mỗi khi có vi phạm, bất kể trạng thái sự cố)
        await SystemLog.create({
            level: 'warn',
            message: `High ${breachDetails.type} reading detected`,
            ctx: {
                ...breachDetails,
                serial_number: sensor.serial_number // <-- SỬA 3: Thêm serial_number
            },
            event_id: activeEvent.id,
            sensor_id: sensor_id
        });

    } catch (error) {
        console.error('Lỗi nghiêm trọng trong Rule Engine:', error);
    }
}

// Xuất (export) hàm này ra
module.exports = {
    processReading
};