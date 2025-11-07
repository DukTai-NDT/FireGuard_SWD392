// simulator.js - PHIÊN BẢN NÂNG CẤP (Hoàn thiện)
const axios = require('axios');

// Địa chỉ API của bạn (chỉnh lại port 8090 nếu cần)
const API_URL = 'http://localhost:8090/api/readings';

// === 1. Dùng mảng (array) cho cả 3 sensor ===
// (ID được lấy từ ảnh bạn đã gửi)
const SENSORS_TO_SIMULATE = [
    { id: '67b7a0f4-ebb8-465c-ab98-bde1ee5869e9', type: 'smoke' },
    { id: 'dee63cea-2c63-48a1-8b2f-6ff6f116dbed', type: 'co2' },
    { id: 'e8191d18-f5b2-4967-bdc8-720f2c66e099', type: 'temperature' }
];

// Hàm helper
function getRandomValue(min, max) {
    return (Math.random() * (max - min) + min).toFixed(2);
}

// === 2. Hàm gửi dữ liệu được sửa lại ===
async function sendMockReading(sensor) {
    
    // Tạo payload cơ bản
    let mockData = {
        sensor_id: sensor.id,
        timestamp: new Date().toISOString()
    };

    // Chỉ thêm dữ liệu CÓ LIÊN QUAN (thực tế hơn)
    // Sensor khói chỉ báo khói
    switch (sensor.type) {
        case 'smoke':
            mockData.smoke_ppm = getRandomValue(80, 150); // Mức bình thường(10, 50)
            break;
        case 'co2':
            mockData.co2_ppm = getRandomValue(400, 1000); // Mức bình thường
            break;
        case 'temperature':
            mockData.temp_c = getRandomValue(70, 80); // Mức bình thường ((20, 30))
            break;
    }

    try {
        // Log tên sensor đang gửi
        console.log(`  -> [${new Date().toLocaleTimeString()}] Gửi cho sensor: ${sensor.type.toUpperCase()}`);
        
        const response = await axios.post(API_URL, mockData);
        
        console.log(`  <- [${new Date().toLocaleTimeString()}] Phản hồi cho ${sensor.type.toUpperCase()}: ${response.status}`);
    
    } catch (error) {
        console.error(`  -> [${new Date().toLocaleTimeString()}] Lỗi khi gửi cho ${sensor.type.toUpperCase()}:`);
        if (error.response) {
            console.error(`    -> Status: ${error.response.status}`);
            console.error(`    -> Data:`, error.response.data);
        } else if (error.request) {
            console.error(`    -> Không nhận được phản hồi (Server BE sập?). Lỗi: ${error.code}`);
        } else {
            console.error('    -> Lỗi không xác định:', error.message);
        }
    }
}

// === 3. Vòng lặp chính (chạy cho cả 3 sensor) ===
const intervalInSeconds = 20;

console.log(`Bắt đầu giả lập: Gửi dữ liệu mỗi ${intervalInSeconds} giây cho ${SENSORS_TO_SIMULATE.length} sensors.`);
console.log('--------------------------------------------------');

// Chạy lần đầu tiên ngay lập tức
SENSORS_TO_SIMULATE.forEach(sensor => {
    sendMockReading(sensor);
});

// Sau đó lặp lại mỗi 5 giây
setInterval(() => {
    console.log(`\n=== Vòng lặp 5s (lúc ${new Date().toLocaleTimeString()}) ===`);
    SENSORS_TO_SIMULATE.forEach(sensor => {
        sendMockReading(sensor);
    });
}, intervalInSeconds * 1000);