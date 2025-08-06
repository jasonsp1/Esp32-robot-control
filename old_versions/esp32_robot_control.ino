// Pin definitions for motor control
#define MOTOR_LEFT_PWM    26
#define MOTOR_RIGHT_PWM   25
// Pin definitions for ESC control
#define LEFT_ESC_PIN      12   // Left ESC signal
#define RIGHT_ESC_PIN     14   // Right ESC signal

// Remove the direction pins - ESCs don't need them
// Remove: #define MOTOR_LEFT_DIR    13
// Remove: #define MOTOR_RIGHT_DIR   15

// Structure to hold robot state
struct RobotState {
  String driveMode = "tracked"; // "tracked" or "truck"
  float forward = 0.0;    // -1.0 (reverse) to 1.0 (forward)
  float turn = 0.0;       // -1.0 (left) to 1.0 (right)
};

RobotState robotState;

void setup() {
  Serial.begin(115200);

  // Initialize motor control pins
  ledcSetup(0, 2000, 8); // PWM channel 0, 2kHz frequency, 8-bit resolution
  ledcAttachPin(MOTOR_LEFT_PWM, 0);
  ledcSetup(1, 2000, 8); // PWM channel 1, 2kHz frequency, 8-bit resolution
  ledcAttachPin(MOTOR_RIGHT_PWM, 1);
  
  // Initialize ESC pins (remove direction pin setup)
  pinMode(LEFT_ESC_PIN, OUTPUT);
  pinMode(RIGHT_ESC_PIN, OUTPUT);
  
  // Initialize ESCs with neutral signal (1500μs pulse)
  analogWrite(LEFT_ESC_PIN, 128);  // ~1500μs neutral
  analogWrite(RIGHT_ESC_PIN, 128);
  delay(2000); // Allow ESCs to initialize
}

void loop() {
  // Example usage:
  robotState.forward = 0.5;  // Move forward at half speed
  robotState.turn = 0.2;     // Turn slightly to the right
  updateMotors();
  delay(100);

  robotState.forward = -0.3; // Move backward slowly
  robotState.turn = -0.1;    // Turn slightly to the left
  updateMotors();
  delay(100);

  robotState.forward = 0.0;  // Stop
  robotState.turn = 0.0;
  updateMotors();
  delay(100);
}

// Replace setMotor function with ESC control:
void setMotor(int escPin, float speed) {
  // Convert -1.0 to 1.0 range to ESC PWM values
  // ESCs typically use 1000-2000μs pulses
  // 1000μs = full reverse, 1500μs = neutral, 2000μs = full forward
  int pwmValue = 128 + (speed * 127); // 1-255 range, 128 = neutral
  pwmValue = constrain(pwmValue, 1, 255);
  
  analogWrite(escPin, pwmValue);
}

// Update the updateMotors function:
void updateMotors() {
  if (robotState.driveMode == "tracked") {
    // Tank/tracked mode - differential steering
    float leftSpeed = robotState.forward - robotState.turn;
    float rightSpeed = robotState.forward + robotState.turn;
    
    // Constrain to -1.0 to 1.0
    leftSpeed = constrain(leftSpeed, -1.0, 1.0);
    rightSpeed = constrain(rightSpeed, -1.0, 1.0);
    
    setMotor(LEFT_ESC_PIN, leftSpeed);
    setMotor(RIGHT_ESC_PIN, rightSpeed);
    
  } else if (robotState.driveMode == "truck") {
    // Truck mode - both motors same speed
    setMotor(LEFT_ESC_PIN, robotState.forward);
    setMotor(RIGHT_ESC_PIN, robotState.forward);
  }
}
