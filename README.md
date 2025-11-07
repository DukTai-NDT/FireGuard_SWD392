BEGIN;

-- =========================
-- 0) SCHEMA & EXTENSIONS
-- =========================
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()
CREATE SCHEMA IF NOT EXISTS firecore AUTHORIZATION CURRENT_USER;
SET search_path = firecore, public;

-- =========================
-- 1) ENUM TYPES (tối giản)
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='sensor_type') THEN
    CREATE TYPE sensor_type AS ENUM ('smoke','temperature','co2');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='event_state') THEN
    CREATE TYPE event_state AS ENUM ('suspected','confirmed','cleared');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='alarm_status') THEN
    CREATE TYPE alarm_status AS ENUM ('active','silenced','reset');
  END IF;
END $$;

-- =========================
-- 2) CORE TABLES
-- =========================

-- 2.1 zones: đủ cho UC12/13 (dashboard + map)
-- map_x, map_y: toạ độ (0..1) quy chiếu ảnh sơ đồ tầng (tiết kiệm, không cần PostGIS)
CREATE TABLE IF NOT EXISTS zones (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
code TEXT UNIQUE NOT NULL,
name TEXT NOT NULL,
floor TEXT, -- ví dụ "B1", "F1", "F2"
map_ref TEXT, -- tên file/URL sơ đồ (tuỳ app dùng)
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.2 sensors: tối ưu cho UC01/12/13
CREATE TABLE IF NOT EXISTS sensors (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
serial_number TEXT UNIQUE NOT NULL,
type sensor_type NOT NULL,
zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
location_note TEXT,
map_x NUMERIC(5,4), -- 0..1 trên sơ đồ
map_y NUMERIC(5,4), -- 0..1 trên sơ đồ
thresholds JSONB NOT NULL DEFAULT '{}'::jsonb, -- ngưỡng cục bộ (override)
is_active BOOLEAN NOT NULL DEFAULT TRUE,
installed_at TIMESTAMPTZ,
last_seen_at TIMESTAMPTZ,
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sensors_zone ON sensors(zone_id);
CREATE INDEX IF NOT EXISTS idx_sensors_type ON sensors(type);
CREATE INDEX IF NOT EXISTS idx_sensors_active ON sensors(is_active);

-- 2.3 detection_policies: nhỏ gọn cho UC04/05/06/09 (rule + auto reset)
CREATE TABLE IF NOT EXISTS detection_policies (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
scope TEXT NOT NULL CHECK (scope IN ('global','zone','sensor')),
zone_id UUID REFERENCES zones(id) ON DELETE CASCADE,
sensor_id UUID REFERENCES sensors(id) ON DELETE CASCADE,
-- Ngưỡng mặc định / điều kiện tương quan
rules JSONB NOT NULL DEFAULT '{"window_sec":120,"smoke_ppm":70,"temp_c":60,"co2_ppm":1200,"need_concurrence":2}'::jsonb,
-- Auto reset khi tất cả chỉ số an toàn liên tục X giây
auto_reset_sec INTEGER NOT NULL DEFAULT 180,
enabled BOOLEAN NOT NULL DEFAULT TRUE,
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_policies_scope ON detection_policies(scope);

-- 2.4 sensor_readings: time-series cho UC01/04/05/12/15 (partition theo tháng)
-- PK gồm reading_ts để hợp lệ với partitioned
CREATE TABLE IF NOT EXISTS sensor_readings (
id BIGINT GENERATED ALWAYS AS IDENTITY,
sensor_id UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
reading_ts TIMESTAMPTZ NOT NULL,
smoke_ppm NUMERIC(10,3),
temp_c NUMERIC(6,2),
co2_ppm NUMERIC(10,2),
payload JSONB NOT NULL DEFAULT '{}'::jsonb,
quality_score SMALLINT NOT NULL DEFAULT 100,
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
CONSTRAINT chk_at_least_one CHECK (
smoke_ppm IS NOT NULL OR temp_c IS NOT NULL OR co2_ppm IS NOT NULL
OR (payload IS NOT NULL AND payload <> '{}'::jsonb)
),
CONSTRAINT chk_temp CHECK (temp_c IS NULL OR (temp_c > -50 AND temp_c < 200)),
CONSTRAINT chk_co2 CHECK (co2_ppm IS NULL OR (co2_ppm >= 0 AND co2_ppm < 100000)),
CONSTRAINT chk_smoke CHECK (smoke_ppm IS NULL OR (smoke_ppm >= 0 AND smoke_ppm < 100000)),
CONSTRAINT sensor_readings_pkey PRIMARY KEY (sensor_id, reading_ts, id)
) PARTITION BY RANGE (reading_ts);

CREATE INDEX IF NOT EXISTS idx_readings_sensor_ts ON sensor_readings(sensor_id, reading_ts);
CREATE INDEX IF NOT EXISTS brin_readings_ts ON sensor_readings USING BRIN (reading_ts) WITH (pages_per_range=64);

-- 2.5 fire_events: trục timeline cho UC05/06/07/09/12/15
CREATE TABLE IF NOT EXISTS fire_events (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
suspected_at TIMESTAMPTZ NOT NULL,
confirmed_at TIMESTAMPTZ,
cleared_at TIMESTAMPTZ,
state event_state NOT NULL,
severity SMALLINT NOT NULL DEFAULT 1,
correlation JSONB NOT NULL DEFAULT '{}'::jsonb, -- bằng chứng tương quan
summary TEXT,
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
CONSTRAINT chk_event_times CHECK (
(state='suspected' AND confirmed_at IS NULL AND cleared_at IS NULL) OR
(state='confirmed' AND confirmed_at IS NOT NULL AND cleared_at IS NULL) OR
(state='cleared' AND confirmed_at IS NOT NULL AND cleared_at IS NOT NULL)
)
);
CREATE INDEX IF NOT EXISTS idx_events_zone ON fire_events(zone_id);
CREATE INDEX IF NOT EXISTS idx_events_state ON fire_events(state);
CREATE INDEX IF NOT EXISTS idx_events_time ON fire_events(suspected_at, confirmed_at, cleared_at);

-- 2.6 alarm_triggers: tối giản cho UC07/09
CREATE TABLE IF NOT EXISTS alarm_triggers (
id BIGSERIAL PRIMARY KEY,
event_id UUID NOT NULL REFERENCES fire_events(id) ON DELETE CASCADE,
zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
status alarm_status NOT NULL DEFAULT 'active',
triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
deactivated_at TIMESTAMPTZ,
details JSONB NOT NULL DEFAULT '{}'::jsonb,
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
CONSTRAINT chk_alarm_times CHECK (
(status <> 'active' AND deactivated_at IS NOT NULL) OR
(status = 'active' AND deactivated_at IS NULL)
)
);
CREATE INDEX IF NOT EXISTS idx_alarm_event ON alarm_triggers(event_id);
CREATE INDEX IF NOT EXISTS idx_alarm_zone_status ON alarm_triggers(zone_id, status);
CREATE INDEX IF NOT EXISTS idx_alarm_triggered_at ON alarm_triggers(triggered_at);

-- 2.7 system_logs: đủ cho UC14/15
CREATE TABLE IF NOT EXISTS system_logs (
id BIGSERIAL PRIMARY KEY,
ts TIMESTAMPTZ NOT NULL DEFAULT now(),
level TEXT NOT NULL CHECK (level IN ('debug','info','warn','error')),
message TEXT NOT NULL,
ctx JSONB NOT NULL DEFAULT '{}'::jsonb,
event_id UUID REFERENCES fire_events(id) ON DELETE SET NULL,
sensor_id UUID REFERENCES sensors(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON system_logs(ts);
CREATE INDEX IF NOT EXISTS gin_logs_ctx ON system_logs USING GIN (ctx);

-- =========================
-- 3) TRIGGERS (nhẹ, đủ dùng)
-- =========================

-- 3.1 auto updated_at
CREATE OR REPLACE FUNCTION firecore.trg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_zones ON zones;
CREATE TRIGGER trg_touch_zones BEFORE UPDATE ON zones FOR EACH ROW EXECUTE FUNCTION firecore.trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_sensors ON sensors;
CREATE TRIGGER trg_touch_sensors BEFORE UPDATE ON sensors FOR EACH ROW EXECUTE FUNCTION firecore.trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_events ON fire_events;
CREATE TRIGGER trg_touch_events BEFORE UPDATE ON fire_events FOR EACH ROW EXECUTE FUNCTION firecore.trg_touch_updated_at();

-- 3.2 partition router cho sensor*readings
CREATE OR REPLACE FUNCTION firecore.ensure_readings_partition(ts timestamptz)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
start_ts timestamptz := date_trunc('month', ts);
end_ts timestamptz := (date_trunc('month', ts) + interval '1 month');
part_name text := 'sensor_readings*' || to*char(start_ts,'YYYYMM');
fq_part text := 'firecore.' || part_name;
BEGIN
IF to_regclass(fq_part) IS NULL THEN
EXECUTE format(
'CREATE TABLE %s PARTITION OF firecore.sensor_readings FOR VALUES FROM (%L) TO (%L);',
fq_part, start_ts, end_ts
);
EXECUTE format(
'CREATE INDEX IF NOT EXISTS %I ON %s (sensor_id, reading_ts);',
'idx*'||part*name||'\_sensor_ts', fq_part
);
EXECUTE format(
'CREATE INDEX IF NOT EXISTS %I ON %s USING BRIN (reading_ts);',
'brin*'||part_name||'\_ts', fq_part
);
END IF;
END $$;

CREATE OR REPLACE FUNCTION firecore.trg_readings_partition_router()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM firecore.ensure_readings_partition(NEW.reading_ts);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS before_insert_readings_partition ON firecore.sensor_readings;
CREATE TRIGGER before_insert_readings_partition
BEFORE INSERT ON firecore.sensor_readings
FOR EACH ROW EXECUTE FUNCTION firecore.trg_readings_partition_router();

-- =========================
-- 4) VIEWS (phục vụ UC12/15)
-- =========================

-- 4.1 giá trị mới nhất mỗi sensor (dashboard)
CREATE OR REPLACE VIEW v_latest_sensor_readings AS
WITH ranked AS (
SELECT sr._, ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY reading_ts DESC) rn
FROM sensor_readings sr
)
SELECT _ FROM ranked WHERE rn=1;

-- 4.2 event + alarm đang mở (dashboard)
CREATE OR REPLACE VIEW v_active_events AS
SELECT \* FROM fire_events WHERE state IN ('suspected','confirmed');

CREATE OR REPLACE VIEW v_active_alarms AS
SELECT \* FROM alarm_triggers WHERE status='active';

-- 4.3 zone health (dashboard)
CREATE OR REPLACE VIEW v_zone_health AS
SELECT
z.id zone_id, z.name zone_name, z.floor,
COUNT(s.id) FILTER (WHERE s.is_active) AS active_sensors,
COUNT(s.id) FILTER (WHERE NOT s.is_active) AS inactive_sensors,
MAX(s.last_seen_at) AS last_seen_any,
COUNT(a.id) FILTER (WHERE a.status='active') AS active_alarms
FROM zones z
LEFT JOIN sensors s ON s.zone_id=z.id
LEFT JOIN alarm_triggers a ON a.zone_id=z.id AND a.status='active'
GROUP BY z.id, z.name, z.floor;

-- 4.4 sensor map (tọa độ trên sơ đồ)
CREATE OR REPLACE VIEW v_sensor_map AS
SELECT s.id AS sensor_id, s.serial_number, s.type, s.map_x, s.map_y, z.name AS zone_name, z.floor, z.map_ref
FROM sensors s JOIN zones z ON z.id=s.zone_id;

-- =========================
-- 5) SEED TỐI THIỂU (tùy chọn)
-- =========================
INSERT INTO zones (code, name, floor, map_ref) VALUES
('F1','Floor 1','F1','map_floor1.png'),
('F2','Floor 2','F2','map_floor2.png')
ON CONFLICT (code) DO NOTHING;

INSERT INTO sensors (serial_number, type, zone_id, location_note, map_x, map_y, thresholds, installed_at, is_active)
SELECT 'SMK-001','smoke', z.id,'Lobby North',0.15,0.22,'{"smoke_ppm":70}'::jsonb, now(), TRUE FROM zones z WHERE z.code='F1'
ON CONFLICT (serial_number) DO NOTHING;

INSERT INTO sensors (serial_number, type, zone_id, location_note, map_x, map_y, thresholds, installed_at, is_active)
SELECT 'TMP-001','temperature', z.id,'Hallway West',0.52,0.40,'{"temp_c":60}'::jsonb, now(), TRUE FROM zones z WHERE z.code='F1'
ON CONFLICT (serial_number) DO NOTHING;

INSERT INTO sensors (serial_number, type, zone_id, location_note, map_x, map_y, thresholds, installed_at, is_active)
SELECT 'CO2-001','co2', z.id,'Server Room',0.72,0.35,'{"co2_ppm":1200}'::jsonb, now(), TRUE FROM zones z WHERE z.code='F2'
ON CONFLICT (serial_number) DO NOTHING;

-- policy global (đủ cho UC04/05/06/09)
INSERT INTO detection_policies(scope, rules, auto_reset_sec)
VALUES ('global','{"window_sec":120,"smoke_ppm":70,"temp_c":60,"co2_ppm":1200,"need_concurrence":2}',180)
ON CONFLICT DO NOTHING;

COMMIT;

-- Tắt trigger phân vùng (không tắt trigger hệ thống RI_ConstraintTrigger)
ALTER TABLE firecore.sensor_readings DISABLE TRIGGER before_insert_readings_partition;
