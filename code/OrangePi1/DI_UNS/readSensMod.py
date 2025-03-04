import time
import struct
import random
from sparkplug_b_pb2 import Payload, DataType
import paho.mqtt.client as mqtt
from bmp280 import BMP280
from smbus2 import SMBus
from pymodbus.client import ModbusTcpClient
import math

BROKER = "localhost"
PORT = 1883
BASE_TOPIC = "spBv1.0/Campus/Geel/D_blok/202/DDATA"

HOST = "192.168.137.3"
PORT_MODBUS = 502
VOLTAGE_REGISTER = 1
CURRENT_REGISTER = 13
POWER_REGISTER = 25

bus = SMBus(0)
address = 0x76
bmp280 = BMP280(i2c_addr=address, i2c_dev=bus)

devices = [
    {"nodeID": "Temperatuur", "deviceID": "Sensor1", "sensor": "temperatuur", "unit": "°C"},
    {"nodeID": "Luchtdruk", "deviceID": "Sensor1", "sensor": "luchtdruk", "unit": "hPa"},
    {"nodeID": "PAC3200", "deviceID": "Voltage", "sensor": "spanning", "unit": "V"},
    {"nodeID": "PAC3200", "deviceID": "Ampere", "sensor": "stroom", "unit": "A"},
    {"nodeID": "PAC3200", "deviceID": "Vermogen", "sensor": "vermogen", "unit": "W"}
]

def read_float(client, register):
    try:
        response = client.read_holding_registers(register, count=2, slave=1)
        if response and not response.isError():
            raw = response.registers
            return struct.unpack('>f', struct.pack('>HH', raw[0], raw[1]))[0]
    except Exception as e:
        print(f"Uitzondering bij uitlezen register {register}: {e}")
    return None

def create_payload(device, modbus_client=None):
    payload = Payload()
    metric = payload.metrics.add()
    metric.name = device["sensor"]
    metric.alias = 1
    metric.timestamp = int(time.time() * 1000)

    if device["sensor"] == "temperatuur":
        metric.datatype = DataType.String
        try:
            temperature = round(bmp280.get_temperature(), 2)
        except Exception as e:
            temperature = 0.00
        metric.string_value = f"{temperature} {device['unit']}"
    elif device["sensor"] == "luchtdruk":
        metric.datatype = DataType.String
        try:
            pressure = round(bmp280.get_pressure(), 2)
        except Exception as e:
            pressure = 0
        metric.string_value = f"{pressure} {device['unit']}"
    elif modbus_client and device["sensor"] in ["spanning", "stroom", "vermogen"]:
        metric.datatype = DataType.String
        register_map = {
            "spanning": VOLTAGE_REGISTER,
            "stroom": CURRENT_REGISTER,
            "vermogen": POWER_REGISTER
        }
        value = read_float(modbus_client, register_map[device["sensor"]])
        
        # Safe check to ensure no NaN value is sent
        if value is None or math.isnan(value):
            value = 0.00
        
        metric.string_value = f"{value:.2f} {device['unit']}"
    return payload

client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION1)
client.connect(BROKER, PORT, 60)

modbus_client = ModbusTcpClient(HOST, port=PORT_MODBUS)
if not modbus_client.connect():
    print("Kon geen verbinding maken met PAC3200.")
    modbus_client = None

try:
    while True:
        for device in devices:
            payload = create_payload(device, modbus_client)
            topic = f"{BASE_TOPIC}/{device['nodeID']}/{device['deviceID']}"
            serialized_payload = payload.SerializeToString()
            client.publish(topic, serialized_payload)
            print(f"Published to {topic}: {payload}")
        time.sleep(1)
finally:
    if modbus_client:
        modbus_client.close()
