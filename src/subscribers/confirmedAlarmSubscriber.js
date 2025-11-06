// subscribers/confirmedAlarmSubscriber.js
// Lắng nghe kênh "fire_events" → khi UC-06 publish state='confirmed', chạy UC-07.

function runConfirmedAlarmSubscriber({ redisSub, activator }) {
  // payload mong đợi từ UC-06:
  // { type: "fire_event_state_changed", state: "confirmed", fireEventId, zone_id, ... }
  redisSub.subscribe("fire_events");
  redisSub.on("message", async (_channel, msg) => {
    try {
      const data = JSON.parse(msg);
      if (
        data?.type === "fire_event_state_changed" &&
        data?.state === "confirmed" &&
        data?.fireEventId
      ) {
        await activator.activateFromConfirmed(data.fireEventId);
      }
    } catch (e) {
      activator?.repos?.warn?.("confirmedAlarmSubscriber error", {
        error: e?.message,
      });
    }
  });
  return () => redisSub.unsubscribe("fire_events");
}

module.exports = { runConfirmedAlarmSubscriber };
