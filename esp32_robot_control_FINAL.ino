#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <SD_MMC.h>
#include <FS.h>
#include <SPIFFS.h>

#define USE_ESC_CONTROL        // For dual brushed ESC

const char* ssid = "Home Wifi";
const char* password = "Wifi password";

WebServer server(80);

// Camera configuration
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

#define FLASHLIGHT_PIN     4   // Built-in LED
#define PAN_SERVO_PIN     33   // Safe pin
#define TILT_SERVO_PIN    16

#ifdef USE_ESC_CONTROL
<<<<<<< ours
  #define LEFT_ESC_PIN    14   // Safe, no boot or SD conflict   // Moved from 13 to avoid SD conflict
  #define RIGHT_ESC_PIN   13   // Safe, no boot or SD conflict   // Moved from 15 to avoid SD conflict
  #define LEFT_ESC_CHANNEL  1
  #define RIGHT_ESC_CHANNEL 2
=======
  #define LEFT_ESC_PIN    12   // Free GPIO; not used by camera or SD interface
  #define RIGHT_ESC_PIN   15   // Free GPIO; not used by camera or SD interface
>>>>>>> theirs
#endif

Servo panServo;
Servo tiltServo;

struct RobotState {
  float forward = 0.0;
  float turn = 0.0;
  float pan = 0.0;
  float tilt = 0.0;
  bool flashlight = false;
  String driveMode = "tracked";
  String streamQuality = "cif";
} robotState;

bool isRecording = false;
File videoFile;
unsigned long lastFrameTime = 0;
int frameCount = 0;

int photoCounter = 1;
int videoCounter = 1;

void setup() {
  Serial.begin(115200);
  delay(500);  // Allow serial to stabilize
  Serial.println("ESP32-CAM Robot Control Starting...");
  if (!psramFound()) {
    Serial.println("[⚠️] PSRAM not found. Camera init may fail.");
  }
  delay(200);

  pinMode(FLASHLIGHT_PIN, OUTPUT);

#ifdef USE_ESC_CONTROL
  Serial.println("Initializing ESC Motor Control...");
  ledcSetup(LEFT_ESC_CHANNEL, 50, 16);            // timer 1
  ledcAttachPin(LEFT_ESC_PIN, LEFT_ESC_CHANNEL);
  ledcSetup(RIGHT_ESC_CHANNEL, 50, 16);           // timer 2
  ledcAttachPin(RIGHT_ESC_PIN, RIGHT_ESC_CHANNEL);
  ledcWrite(LEFT_ESC_CHANNEL, 4915);
  ledcWrite(RIGHT_ESC_CHANNEL, 4915);
  delay(3000);  // ESC arm delay
  Serial.println("ESCs ready!");
#endif

  delay(300);  // Stabilize before SD card init
  if (!SD_MMC.begin()) {
    Serial.println("SD Card Mount Failed");
  } else {
    Serial.println("SD Card initialized successfully");
    panServo.attach(PAN_SERVO_PIN);
    tiltServo.attach(TILT_SERVO_PIN);
    panServo.write(90);
    tiltServo.write(90);
    if (!SD_MMC.exists("/photos")) SD_MMC.mkdir("/photos");
    if (!SD_MMC.exists("/videos")) SD_MMC.mkdir("/videos");
  }

  delay(500);  // Stabilize before camera init
  camera_config_t config = {};
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
  config.frame_size = FRAMESIZE_QQVGA;  // Reduced resolution
  config.jpeg_quality = 20;             // Reduced quality
  config.fb_count = 2;
  config.fb_location = CAMERA_FB_IN_DRAM;  // Use internal DRAM instead of PSRAM
  config.grab_mode = CAMERA_GRAB_LATEST;
  config.sccb_i2c_port = 0;
  config.sccb_i2c_freq = 100000;

  Serial.println("Init camera...");
  if (esp_camera_init(&config) != ESP_OK) {
    Serial.println("Camera init failed");
    return;
  }
  Serial.println("Camera OK");

  delay(300);  // Camera settle before Wi-Fi
  Serial.println("Connecting to WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }

  Serial.println("WiFi connected");
  delay(300);  // Network settle before starting server
  Serial.println("Starting web server setup...");
  Serial.print("Camera Ready! Use 'http://");
  Serial.print(WiFi.localIP());
  Serial.println("' to connect");

  setupWebServer();
  Serial.println("Web server started");
  server.begin();
  Serial.println("Web server started");
}

void loop() {
  server.handleClient();
  if (isRecording) {
    recordVideoFrame();
  }
}

void handleStream() {
  WiFiClient client = server.client();
  String response = "HTTP/1.1 200 OK\r\n";
  response += "Content-Type: multipart/x-mixed-replace; boundary=frame\r\n\r\n";
  server.sendContent(response);

  while (client.connected()) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("Camera capture failed");
      break;
    }

    String header = "--frame\r\n";
    header += "Content-Type: image/jpeg\r\n";
    header += "Content-Length: " + String(fb->len) + "\r\n\r\n";
    server.sendContent(header);
    server.sendContent((const char*)fb->buf, fb->len);
    server.sendContent("\r\n");

    esp_camera_fb_return(fb);
    if (!client.connected()) break;
  }
}

void handleCapturePhoto() {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    server.send(500, "text/plain", "Camera capture failed");
    return;
  }

  String path = "/photos/photo" + String(photoCounter++) + ".jpg";
  File file = SD_MMC.open(path.c_str(), FILE_WRITE);
  if (!file) {
    server.send(500, "text/plain", "Failed to open file");
    esp_camera_fb_return(fb);
    return;
  }
  file.write(fb->buf, fb->len);
  file.close();
  esp_camera_fb_return(fb);

  server.send(200, "text/plain", "Saved: " + path);
}

void handleStartRecording() {
  String path = "/videos/video" + String(videoCounter++) + ".mjpeg";
  videoFile = SD_MMC.open(path.c_str(), FILE_WRITE);
  if (!videoFile) {
    server.send(500, "text/plain", "Failed to create video file");
    return;
  }
  isRecording = true;
  frameCount = 0;
  server.send(200, "text/plain", "Recording started");
}

void handleStopRecording() {
  isRecording = false;
  if (videoFile) videoFile.close();
  server.send(200, "text/plain", "Recording stopped");
}

void recordVideoFrame() {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb || !videoFile) {
    Serial.println("[!] Frame skipped or videoFile invalid");
    return;
  }
  videoFile.write(fb->buf, fb->len);
  esp_camera_fb_return(fb);
  frameCount++;
}

void setupWebServer() {
  server.on("/", HTTP_GET, []() {
    server.send(200, "text/html", "<html><body><h1>ESP32-CAM</h1></body></html>");
  });
  server.on("/capture", HTTP_GET, handleCapturePhoto);
  server.on("/start", HTTP_GET, handleStartRecording);
  server.on("/stop", HTTP_GET, handleStopRecording);
  server.on("/stream", HTTP_GET, handleStream);
}
