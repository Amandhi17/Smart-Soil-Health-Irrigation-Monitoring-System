#include <WiFi.h>
#include <WiFiClientSecure.h> 
#include <PubSubClient.h>
#include <DHT.h>
#include <Wire.h>
#include <BH1750.h>
#include <Firebase_ESP_Client.h>
#include "time.h"

// Firebase helpers
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

// --- 1. Wi-Fi Settings ---
const char* ssid = "SLT-LTE-WiFi-8ADB";
const char* password = "DHGA72M2GNH";

// --- 2. HiveMQ Cloud Settings ---
const char* mqtt_server = "fb85734f46a8481c868ca7111d11653e.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;
const char* mqtt_user = "abc123";
const char* mqtt_pass = "12345678Ama";
const char* mqtt_topic = "plant/sensors";

// --- 3. Firebase Settings ---
#define FIREBASE_HOST "plantmonitoring-2fc3a-default-rtdb.firebaseio.com" 
#define FIREBASE_AUTH "tecs6pNUDtvd3HCV4eQYnUyEwhMwDqxrybZerNX0" 

// --- 4. NTP (Time) Settings ---
const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = 19800;
const int   daylightOffset_sec = 0;

// --- 5. Sensor Settings ---
#define DHTPIN 4      
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

#define SOILPIN 34    
const int AirValue = 3000;  
const int WaterValue = 1500; 

BH1750 lightMeter;

// --- Local Buffer Settings ---
#define BUFFER_SIZE 10

struct SensorData {
  float temp;
  float humidity;
  int soil;
  float light;
  String timestamp;
};

SensorData localBuffer[BUFFER_SIZE];
int bufferIndex = 0;
bool bufferFilled = false;

// --- OFFLINE SYNC FLAG ---
bool wasOffline = false;

// --- WiFi Reconnect Timer ---
unsigned long lastWifiAttempt = 0;
const long wifiRetryInterval = 10000;

// --- Global Objects ---
WiFiClientSecure espClient; 
PubSubClient client(espClient);
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

unsigned long lastMsg = 0;
const long sendInterval = 900000;

// ------------------ OFFLINE SYNC FUNCTION ------------------
void syncOfflineData() {
  Serial.println("Syncing offline buffer data...");

  int count = bufferFilled ? BUFFER_SIZE : bufferIndex;

  for (int i = 0; i < count; i++) {

    String jsonPayload =
      "{\"temp\":" + String(localBuffer[i].temp) +
      ",\"hum\":" + String(localBuffer[i].humidity) +
      ",\"soil\":" + String(localBuffer[i].soil) +
      ",\"light\":" + String(localBuffer[i].light) + "}";

    client.publish(mqtt_topic, jsonPayload.c_str());

    FirebaseJson firebaseJson;
    firebaseJson.set("temperature", localBuffer[i].temp);
    firebaseJson.set("humidity", localBuffer[i].humidity);
    firebaseJson.set("soil_moisture", localBuffer[i].soil);
    firebaseJson.set("light_lux", localBuffer[i].light);
    firebaseJson.set("timestamp", localBuffer[i].timestamp);

    Firebase.RTDB.pushJSON(&fbdo, "/sensors", &firebaseJson);

    delay(200);
  }

  Serial.println("Offline sync completed ✔");
}

// ------------------ SETUP ------------------
void setup() {
  Serial.begin(115200);
  
  dht.begin();
  Wire.begin(); 
  lightMeter.begin();

  WiFi.begin(ssid, password);
  Serial.print("Connecting to Wi-Fi");
  
  int wifiAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifiAttempts < 20) {
    delay(500);
    Serial.print(".");
    wifiAttempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWi-Fi Connected!");
    configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
    Serial.println("Time Synchronized");
  } else {
    Serial.println("\nWi-Fi FAILED - running in offline mode");
    wasOffline = true;
  }

  espClient.setInsecure(); 
  client.setServer(mqtt_server, mqtt_port);

  config.host = FIREBASE_HOST;
  config.signer.tokens.legacy_token = FIREBASE_AUTH;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

// ------------------ MQTT RECONNECT (NON-BLOCKING) ------------------
void reconnectMQTT() {
  if (client.connected()) return;

  Serial.print("Attempting HiveMQ connection...");
  String clientId = "ESP32Plant-" + String(random(0, 0xffff), HEX);
  if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
    Serial.println("Connected!");
  } else {
    Serial.print("Failed, rc=");
    Serial.println(client.state());
  }
}

// ------------------ LOOP ------------------
void loop() {

  // --- Handle WiFi reconnection (non-blocking) ---
  if (WiFi.status() != WL_CONNECTED) {
    wasOffline = true;
    unsigned long now = millis();
    if (now - lastWifiAttempt > wifiRetryInterval) {
      lastWifiAttempt = now;
      Serial.println("WiFi disconnected. Attempting reconnect...");
      WiFi.disconnect();
      WiFi.begin(ssid, password);
    }
  }

  // --- Handle MQTT and sync when online ---
  if (WiFi.status() == WL_CONNECTED) {
    if (!client.connected()) {
      reconnectMQTT();
    }
    client.loop();

    // --- Detect WiFi recovery ---
    if (wasOffline) {
      Serial.println("WiFi restored! Starting offline sync...");
      configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
      syncOfflineData();
      wasOffline = false;
    }
  }

  unsigned long now = millis();
  if (now - lastMsg > sendInterval) {
    lastMsg = now;

    float temp = dht.readTemperature();
    float humidity = dht.readHumidity();
    int soilRaw = analogRead(SOILPIN);
    int soilPercent = map(soilRaw, AirValue, WaterValue, 0, 100);
    soilPercent = constrain(soilPercent, 0, 100); 
    float lux = lightMeter.readLightLevel();

    if (isnan(temp) || isnan(humidity)) {
      Serial.println("Sensor Error!");
      return;
    }

    struct tm timeinfo;
    String timeString = "Waiting...";
    
    if (getLocalTime(&timeinfo)) {
      char timeStringBuff[50];
      strftime(timeStringBuff, sizeof(timeStringBuff), "%Y-%m-%d %H:%M:%S", &timeinfo);
      timeString = String(timeStringBuff);
    }

    // --- ALWAYS STORE IN BUFFER ---
    localBuffer[bufferIndex].temp = temp;
    localBuffer[bufferIndex].humidity = humidity;
    localBuffer[bufferIndex].soil = soilPercent;
    localBuffer[bufferIndex].light = lux;
    localBuffer[bufferIndex].timestamp = timeString;

    // 🔥 LIVE BUFFER PRINT
    Serial.println("---- Local Buffer ----");

    int count = bufferFilled ? BUFFER_SIZE : bufferIndex + 1;

    for (int i = 0; i < count; i++) {
      Serial.println(
        "T:" + String(localBuffer[i].temp) +
        " H:" + String(localBuffer[i].humidity) +
        " S:" + String(localBuffer[i].soil) +
        " L:" + String(localBuffer[i].light) +
        " Time:" + localBuffer[i].timestamp
      );
    }

    bufferIndex = (bufferIndex + 1) % BUFFER_SIZE;
    if (bufferIndex == 0) bufferFilled = true;

    // --- Send ONLY if online ---
    if (WiFi.status() == WL_CONNECTED && client.connected()) {
      // --- Send to HiveMQ ---
      String jsonPayload = "{\"temp\":" + String(temp) + ",\"hum\":" + String(humidity) + ",\"soil\":" + String(soilPercent) + ",\"light\":" + String(lux) + "}";
      client.publish(mqtt_topic, jsonPayload.c_str());
      Serial.println("Sent to HiveMQ: " + jsonPayload);

      // --- Send to Firebase ---
      FirebaseJson firebaseJson;
      firebaseJson.set("temperature", temp);
      firebaseJson.set("humidity", humidity);
      firebaseJson.set("soil_moisture", soilPercent);
      firebaseJson.set("light_lux", lux);
      firebaseJson.set("timestamp", timeString);

      if (Firebase.RTDB.pushJSON(&fbdo, "/sensors", &firebaseJson)) {
        Serial.println("Firebase Log Created at: " + timeString);
      } else {
        Serial.println("Firebase Error: " + fbdo.errorReason());
      }
    } else {
      Serial.println("Offline - data buffered locally");
    }
  }
}