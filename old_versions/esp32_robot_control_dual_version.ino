#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <SD_MMC.h>
#include <FS.h>
#include <SPIFFS.h>

// ========================================
// MOTOR CONTROL SELECTION
// ========================================
// Uncomment ONE of the following lines to select your motor control type:

#define USE_ESC_CONTROL        // For dual brushed ESC
// #define USE_HBRIDGE_CONTROL    // For H-Bridge (MX1508, etc.)

// ========================================

// WiFi credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Web server
WebServer server(80);

// Camera configuration for AI Thinker ESP32-CAM
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// Common pin definitions
#define FLASHLIGHT_PIN     4   // Built-in LED
#define PAN_SERVO_PIN      2   // Pan servo
#define TILT_SERVO_PIN    16   // Tilt servo

// ========================================
// MOTOR CONTROL PIN DEFINITIONS
// ========================================

#ifdef USE_ESC_CONTROL
  // ESC Control Pins
  #define LEFT_ESC_PIN      12   // Left ESC signal
  #define RIGHT_ESC_PIN     14   // Right ESC signal
  // No direction pins needed for ESCs
#endif

#ifdef USE_HBRIDGE_CONTROL
  // H-Bridge Control Pins
  #define MOTOR_LEFT_PWM    12   // Left motor PWM
  #define MOTOR_LEFT_DIR    13   // Left motor direction
  #define MOTOR_RIGHT_PWM   14   // Right motor PWM  
  #define MOTOR_RIGHT_DIR   15   // Right motor direction
#endif

// ========================================

// Servo objects
Servo panServo;
Servo tiltServo;

// Control variables
struct RobotState {
  float forward = 0.0;
  float turn = 0.0;
  float pan = 0.0;
  float tilt = 0.0;
  bool flashlight = false;
  String driveMode = "tracked";
  String streamQuality = "cif";
} robotState;

// Recording state
bool isRecording = false;
File videoFile;
unsigned long lastFrameTime = 0;
int frameCount = 0;

// Media file counter
int photoCounter = 1;
int videoCounter = 1;

void setup() {
  Serial.begin(115200);
  Serial.println("ESP32-CAM Robot Control Starting...");

  // Initialize common pins
  pinMode(FLASHLIGHT_PIN, OUTPUT);
  
  // ========================================
  // MOTOR CONTROL INITIALIZATION
  // ========================================
  
#ifdef USE_ESC_CONTROL
  Serial.println("Initializing ESC Motor Control...");
  
  // Setup PWM channels for ESCs
  ledcSetup(0, 50, 16); // Channel 0, 50Hz frequency, 16-bit resolution for servo-style PWM
  ledcAttachPin(LEFT_ESC_PIN, 0);
  ledcSetup(1, 50, 16); // Channel 1, 50Hz frequency, 16-bit resolution
  ledcAttachPin(RIGHT_ESC_PIN, 1);
  
  // Initialize ESCs with neutral signal (1500μs pulse)
  ledcWrite(0, 4915); // ~1500μs neutral (1500/20000 * 65535)
  ledcWrite(1, 4915); // ~1500μs neutral
  
  Serial.println("ESC initialization - sending neutral signals for 3 seconds...");
  delay(3000); // Allow ESCs to initialize and arm
  Serial.println("ESCs ready!");
#endif

#ifdef USE_HBRIDGE_CONTROL
  Serial.println("Initializing H-Bridge Motor Control...");
  
  // Setup pins for H-Bridge
  pinMode(MOTOR_LEFT_PWM, OUTPUT);
  pinMode(MOTOR_LEFT_DIR, OUTPUT);
  pinMode(MOTOR_RIGHT_PWM, OUTPUT);
  pinMode(MOTOR_RIGHT_DIR, OUTPUT);
  
  // Initialize motors stopped
  digitalWrite(MOTOR_LEFT_DIR, LOW);
  analogWrite(MOTOR_LEFT_PWM, 0);
  digitalWrite(MOTOR_RIGHT_DIR, LOW);
  analogWrite(MOTOR_RIGHT_PWM, 0);
  
  Serial.println("H-Bridge ready!");
#endif

  // ========================================
  
  // Initialize servos
  panServo.attach(PAN_SERVO_PIN);
  tiltServo.attach(TILT_SERVO_PIN);
  
  // Center servos
  panServo.write(90);
  tiltServo.write(90);
  
  // Initialize SD card
  if (!SD_MMC.begin()) {
    Serial.println("SD Card Mount Failed");
  } else {
    Serial.println("SD Card initialized successfully");
    // Create directories if they don't exist
    if (!SD_MMC.exists("/photos")) {
      SD_MMC.mkdir("/photos");
    }
    if (!SD_MMC.exists("/videos")) {
      SD_MMC.mkdir("/videos");
    }
  }

  // Initialize camera
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  
  // Set initial frame size
  config.frame_size = FRAMESIZE_CIF; // 352x288
  config.jpeg_quality = 12;
  config.fb_count = 1;

  // Camera init
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x", err);
    return;
  }

  // Connect to WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  Serial.println("WiFi connected");
  Serial.print("Camera Ready! Use 'http://");
  Serial.print(WiFi.localIP());
  Serial.println("' to connect");

  // Setup web server routes
  setupWebServer();
  
  server.begin();
  Serial.println("Web server started");
}

void loop() {
  server.handleClient();
  
  // Update robot controls
  updateMotors();
  updateServos();
  updateFlashlight();
  
  // Handle video recording
  if (isRecording) {
    recordVideoFrame();
  }
  
  delay(20); // 50Hz update rate
}

// ========================================
// MOTOR CONTROL FUNCTIONS
// ========================================

void updateMotors() {
  if (robotState.driveMode == "tracked") {
    // Tank/tracked mode - differential steering
    float leftSpeed = robotState.forward - robotState.turn;
    float rightSpeed = robotState.forward + robotState.turn;
    
    // Constrain to -1.0 to 1.0
    leftSpeed = constrain(leftSpeed, -1.0, 1.0);
    rightSpeed = constrain(rightSpeed, -1.0, 1.0);
    
    setLeftMotor(leftSpeed);
    setRightMotor(rightSpeed);
    
  } else if (robotState.driveMode == "truck") {
    // Truck mode - both motors same speed, steering via servo
    setLeftMotor(robotState.forward);
    setRightMotor(robotState.forward);
  }
}

#ifdef USE_ESC_CONTROL
void setLeftMotor(float speed) {
  // Convert -1.0 to 1.0 range to ESC PWM values
  // ESCs use 1000-2000μs pulses: 1000μs = full reverse, 1500μs = neutral, 2000μs = full forward
  int pulseWidth = 1500 + (speed * 500); // 1000-2000μs range
  pulseWidth = constrain(pulseWidth, 1000, 2000);
  
  // Convert to 16-bit PWM value for 50Hz (20ms period)
  int pwmValue = (pulseWidth * 65535) / 20000;
  ledcWrite(0, pwmValue);
  
  Serial.print("Left ESC: ");
  Serial.print(speed);
  Serial.print(" -> ");
  Serial.print(pulseWidth);
  Serial.println("μs");
}

void setRightMotor(float speed) {
  // Convert -1.0 to 1.0 range to ESC PWM values
  int pulseWidth = 1500 + (speed * 500); // 1000-2000μs range
  pulseWidth = constrain(pulseWidth, 1000, 2000);
  
  // Convert to 16-bit PWM value for 50Hz (20ms period)
  int pwmValue = (pulseWidth * 65535) / 20000;
  ledcWrite(1, pwmValue);
  
  Serial.print("Right ESC: ");
  Serial.print(speed);
  Serial.print(" -> ");
  Serial.print(pulseWidth);
  Serial.println("μs");
}
#endif

#ifdef USE_HBRIDGE_CONTROL
void setLeftMotor(float speed) {
  // Convert -1.0 to 1.0 range to PWM values
  int pwmValue = abs(speed * 255);
  bool direction = speed >= 0;
  
  digitalWrite(MOTOR_LEFT_DIR, direction);
  analogWrite(MOTOR_LEFT_PWM, pwmValue);
  
  Serial.print("Left H-Bridge: ");
  Serial.print(speed);
  Serial.print(" -> PWM:");
  Serial.print(pwmValue);
  Serial.print(" DIR:");
  Serial.println(direction ? "FWD" : "REV");
}

void setRightMotor(float speed) {
  // Convert -1.0 to 1.0 range to PWM values
  int pwmValue = abs(speed * 255);
  bool direction = speed >= 0;
  
  digitalWrite(MOTOR_RIGHT_DIR, direction);
  analogWrite(MOTOR_RIGHT_PWM, pwmValue);
  
  Serial.print("Right H-Bridge: ");
  Serial.print(speed);
  Serial.print(" -> PWM:");
  Serial.print(pwmValue);
  Serial.print(" DIR:");
  Serial.println(direction ? "FWD" : "REV");
}
#endif

// ========================================
// REST OF THE CODE (unchanged)
// ========================================

void setupWebServer() {
  // CORS headers for all responses
  server.onNotFound([]() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    server.send(404, "text/plain", "Not Found");
  });

  // Handle preflight requests
  server.on("/", HTTP_OPTIONS, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    server.send(200);
  });

  // Camera stream
  server.on("/stream", HTTP_GET, handleStream);
  
  // Control endpoints
  server.on("/control", HTTP_POST, handleControl);
  server.on("/flashlight", HTTP_GET, handleFlashlight);
  
  // Media endpoints
  server.on("/capture", HTTP_GET, handleCapture);
  server.on("/start-recording", HTTP_GET, handleStartRecording);
  server.on("/stop-recording", HTTP_GET, handleStopRecording);
  server.on("/media-list", HTTP_GET, handleMediaList);
  server.on("/delete-media", HTTP_DELETE, handleDeleteMedia);
  
  // Serve media files
  server.onNotFound(handleMediaFile);
}

void handleStream() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  
  WiFiClient client = server.client();
  String response = "HTTP/1.1 200 OK\r\n";
  response += "Content-Type: multipart/x-mixed-replace; boundary=frame\r\n\r\n";
  server.sendContent(response);

  while (client.connected()) {
    camera_fb_t * fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("Camera capture failed");
      break;
    }

    String header = "--frame\r\n";
    header += "Content-Type: image/jpeg\r\n";
    header += "Content-Length: " + String(fb->len) + "\r\n\r\n";
    
    server.sendContent(header);
    client.write(fb->buf, fb->len);
    server.sendContent("\r\n");
    
    esp_camera_fb_return(fb);
    
    if (!client.connected()) break;
    delay(33); // ~30 FPS
  }
}

void handleControl() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  
  if (server.hasArg("plain")) {
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, server.arg("plain"));
    
    robotState.forward = doc["forward"] | 0.0;
    robotState.turn = doc["turn"] | 0.0;
    robotState.pan = doc["pan"] | 0.0;
    robotState.tilt = doc["tilt"] | 0.0;
    robotState.flashlight = doc["flashlight"] | false;
    robotState.driveMode = doc["driveMode"] | "tracked";
    robotState.streamQuality = doc["streamQuality"] | "cif";
    
    // Update camera quality if changed
    updateCameraQuality();
    
    server.send(200, "application/json", "{\"success\":true}");
  } else {
    server.send(400, "application/json", "{\"success\":false,\"error\":\"No data\"}");
  }
}

void handleFlashlight() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  
  if (server.hasArg("state")) {
    robotState.flashlight = server.arg("state") == "true";
    server.send(200, "application/json", "{\"success\":true}");
  } else {
    server.send(400, "application/json", "{\"success\":false,\"error\":\"Missing state parameter\"}");
  }
}

void handleCapture() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  
  camera_fb_t * fb = esp_camera_fb_get();
  if (!fb) {
    server.send(500, "application/json", "{\"success\":false,\"error\":\"Camera capture failed\"}");
    return;
  }

  String filename = "/photos/photo_" + String(photoCounter++) + ".jpg";
  File file = SD_MMC.open(filename, FILE_WRITE);
  
  if (file) {
    file.write(fb->buf, fb->len);
    file.close();
    
    DynamicJsonDocument doc(256);
    doc["success"] = true;
    doc["filename"] = filename;
    doc["size"] = fb->len;
    
    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  } else {
    server.send(500, "application/json", "{\"success\":false,\"error\":\"Failed to save file\"}");
  }
  
  esp_camera_fb_return(fb);
}

void handleStartRecording() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  
  if (isRecording) {
    server.send(400, "application/json", "{\"success\":false,\"error\":\"Already recording\"}");
    return;
  }
  
  String filename = "/videos/video_" + String(videoCounter++) + ".mjpeg";
  videoFile = SD_MMC.open(filename, FILE_WRITE);
  
  if (videoFile) {
    isRecording = true;
    frameCount = 0;
    lastFrameTime = millis();
    
    DynamicJsonDocument doc(256);
    doc["success"] = true;
    doc["filename"] = filename;
    
    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  } else {
    server.send(500, "application/json", "{\"success\":false,\"error\":\"Failed to create video file\"}");
  }
}

void handleStopRecording() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  
  if (!isRecording) {
    server.send(400, "application/json", "{\"success\":false,\"error\":\"Not recording\"}");
    return;
  }
  
  isRecording = false;
  if (videoFile) {
    videoFile.close();
  }
  
  DynamicJsonDocument doc(256);
  doc["success"] = true;
  doc["frames"] = frameCount;
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

void handleMediaList() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  
  DynamicJsonDocument doc(4096);
  JsonArray files = doc.to<JsonArray>();
  
  // List photos
  File photoDir = SD_MMC.open("/photos");
  if (photoDir) {
    File file = photoDir.openNextFile();
    while (file) {
      if (!file.isDirectory()) {
        JsonObject fileObj = files.createNestedObject();
        fileObj["name"] = String(file.name());
        fileObj["type"] = "image";
        fileObj["size"] = file.size();
        fileObj["timestamp"] = getFileTimestamp(file);
        fileObj["url"] = "/media" + String(file.name());
      }
      file = photoDir.openNextFile();
    }
    photoDir.close();
  }
  
  // List videos
  File videoDir = SD_MMC.open("/videos");
  if (videoDir) {
    File file = videoDir.openNextFile();
    while (file) {
      if (!file.isDirectory()) {
        JsonObject fileObj = files.createNestedObject();
        fileObj["name"] = String(file.name());
        fileObj["type"] = "video";
        fileObj["size"] = file.size();
        fileObj["timestamp"] = getFileTimestamp(file);
        fileObj["url"] = "/media" + String(file.name());
      }
      file = videoDir.openNextFile();
    }
    videoDir.close();
  }
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

void handleDeleteMedia() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  
  if (server.hasArg("file")) {
    String filename = server.arg("file");
    
    if (SD_MMC.remove(filename)) {
      server.send(200, "application/json", "{\"success\":true}");
    } else {
      server.send(500, "application/json", "{\"success\":false,\"error\":\"Failed to delete file\"}");
    }
  } else {
    server.send(400, "application/json", "{\"success\":false,\"error\":\"Missing file parameter\"}");
  }
}

void handleMediaFile() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  
  String path = server.uri();
  if (path.startsWith("/media/")) {
    path = path.substring(6); // Remove "/media" prefix
    
    if (SD_MMC.exists(path)) {
      File file = SD_MMC.open(path, FILE_READ);
      if (file) {
        String contentType = "application/octet-stream";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) {
          contentType = "image/jpeg";
        } else if (path.endsWith(".mjpeg")) {
          contentType = "video/x-motion-jpeg";
        }
        
        server.streamFile(file, contentType);
        file.close();
        return;
      }
    }
  }
  
  server.send(404, "text/plain", "File not found");
}

void updateServos() {
  // Convert -1.0 to 1.0 range to servo angles (0-180)
  int panAngle = 90 + (robotState.pan * 90);
  int tiltAngle = 90 + (robotState.tilt * 90);
  
  // Constrain angles
  panAngle = constrain(panAngle, 0, 180);
  tiltAngle = constrain(tiltAngle, 0, 180);
  
  if (robotState.driveMode == "truck") {
    // In truck mode, pan servo is used for steering
    int steerAngle = 90 + (robotState.turn * 45); // ±45 degrees
    steerAngle = constrain(steerAngle, 45, 135);
    panServo.write(steerAngle);
    
    // Tilt servo still controls camera tilt
    tiltServo.write(tiltAngle);
  } else {
    // Normal camera pan/tilt
    panServo.write(panAngle);
    tiltServo.write(tiltAngle);
  }
}

void updateFlashlight() {
  digitalWrite(FLASHLIGHT_PIN, robotState.flashlight ? HIGH : LOW);
}

void updateCameraQuality() {
  sensor_t * s = esp_camera_sensor_get();
  if (s != NULL) {
    if (robotState.streamQuality == "qvga") {
      s->set_framesize(s, FRAMESIZE_QVGA); // 320x240
    } else if (robotState.streamQuality == "cif") {
      s->set_framesize(s, FRAMESIZE_CIF);  // 352x288
    } else if (robotState.streamQuality == "vga") {
      s->set_framesize(s, FRAMESIZE_VGA);  // 640x480
    }
  }
}

void recordVideoFrame() {
  unsigned long currentTime = millis();
  if (currentTime - lastFrameTime >= 100) { // 10 FPS for video recording
    camera_fb_t * fb = esp_camera_fb_get();
    if (fb && videoFile) {
      // Write MJPEG frame header
      videoFile.write((uint8_t*)"\xFF\xD8", 2); // JPEG SOI marker
      videoFile.write(fb->buf, fb->len);
      frameCount++;
      lastFrameTime = currentTime;
    }
    if (fb) {
      esp_camera_fb_return(fb);
    }
  }
}

String getFileTimestamp(File file) {
  // Simple timestamp - you could enhance this with RTC
  return String(file.getLastWrite());
}
