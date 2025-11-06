// src/controllers/alarmResetController.js
const { sequelize, AlarmTrigger, FireEvent } = require("../models");
const { Op } = require("sequelize");

exports.autoResetAlarms = async (req, res, next) => {
    const transaction = await sequelize.transaction();

    try {
        const now = new Date();

        // 🔍 Tìm tất cả alarm đang "active" quá thời gian tự reset
        const expiredAlarms = await AlarmTrigger.findAll({
            where: {
                status: "active",
                triggered_at: {
                    [Op.lt]: new Date(now.getTime() - 5 * 60 * 1000), // quá 5 phút
                },
            },
            transaction,
        });

        if (!expiredAlarms.length) {
            await transaction.commit();
            return res.json({
                message: "No active alarms to reset",
            });
        }

        // 🔄 Cập nhật trạng thái về 'reset'
        const alarmIds = expiredAlarms.map((a) => a.id);
        await AlarmTrigger.update(
            {
                status: "reset",
                deactivated_at: now,
            },
            { where: { id: alarmIds }, transaction }
        );

        // ✅ Ghi log vào fire_events (tùy chọn)
        for (const alarm of expiredAlarms) {
            await FireEvent.update(
                { cleared_at: now, state: "cleared" },
                { where: { id: alarm.event_id }, transaction }
            );
        }

        await transaction.commit();

        res.json({
            message: "Auto-reset executed successfully",
            resetCount: alarmIds.length,
        });
    } catch (error) {
        await transaction.rollback();
        next(error);
    }
};

exports.getAllAlarms = async (req, res, next) => {
    try {
        const alarms = await AlarmTrigger.findAll({
            attributes: [
                "id",
                "event_id",
                "zone_id",
                "status",
                "triggered_at",
                "deactivated_at",
                "details",
            ],
            order: [["triggered_at", "DESC"]],
        });

        return res.json({
            message: "All alarms fetched successfully",
            data: alarms,
        });
    } catch (error) {
        console.error("Error fetching alarms:", error);
        return res.status(500).json({
            message: "Internal Server Error",
            error: error.message,
        });
    }
};