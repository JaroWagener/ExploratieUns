import time
import random
from sparkplug_b_pb2 import Payload, DataType
import paho.mqtt.client as mqtt
from bmp280 import BMP280
from smbus2 import SMBus

BROKER = "localhost"
PORT = 1883
BASE_TOPIC = "spBv1.0/Campus/Geel/D_blok/203/DDATA"

#Instellen van BMP280
bus = SMBus(0)
address = 0x76
bmp280 = BMP280(i2c_addr=address, i2c_dev=bus)

devices = [
    {"nodeID": "Temperatuur", "deviceID": "Sensor1", "sensor": "temperatuur", "unit": "°C"},
    {"nodeID": "Luchtdruk", "deviceID": "Sensor1", "sensor": "luchtdruk", "unit": "hPa"}
]

#Opstellen van de payload
def create_payload(device):
    payload = Payload()
    metric = payload.metrics.add()
    metric.name = device["sensor"]
    metric.alias = 1
    metric.timestamp = int(time.time() * 1000)

    if device["sensor"] == "temperatuur":
        metric.datatype = DataType.String
        try:
            temperature = round(bmp280.get_temperature(), 2)
        except Exception as e:  # Capture and handle exceptions properly
            temperature = 0.00
        metric.string_value = f"{temperature} {device['unit']}"
    elif device["sensor"] == "luchtdruk":
        metric.datatype = DataType.String
        try:
            pressure = round(bmp280.get_pressure(), 2)
        except Exception as e:  # Fixes "expect" to "except"
            pressure = 0
        metric.string_value = f"{pressure} {device['unit']}"

    return payload



#Verbinding maken met de hivemq edge container
client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION1)
client.connect(BROKER, PORT, 60)

while True:
    #Doorheen opgegeven devices heen gaan en payload opsturen
    for device in devices:
        payload = create_payload(device)
        topic = f"{BASE_TOPIC}/{device['nodeID']}/{device['deviceID']}"
        
        serialized_payload = payload.SerializeToString()
        client.publish(topic, serialized_payload)
        print(f"Published to {topic}: {payload}")
    time.sleep(1)
