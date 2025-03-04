const mqtt = require('mqtt');
const fs = require('fs');
const protobuf = require('protobufjs');

// Log function - write logs to a file
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFile('application.log', logMessage, (err) => {
    if (err) {
      console.error('Failed to write to log file:', err);
    }
  });
}

// Load the Sparkplug B protobuf definition
const SPARKPLUG_PROTO_PATH = './app/sparkplug_b.proto';
let Payload;
let protobufLoaded = false;

protobuf.load(SPARKPLUG_PROTO_PATH, (err, root) => {
  if (err) {
    log(`Protobuf load error: ${err}`);
    throw err;
  }
  Payload = root.lookupType("org.eclipse.tahu.protobuf.Payload");
  protobufLoaded = true;
  log('Protobuf loaded successfully');
});

let topics = { name: "spBv1.0", children: [] };
let client; // MQTT client placeholder
const options = {
  host: '<your-host>',
  port: 8883,
  protocol: 'mqtts',
  username: '<username>',
  password: '<password>',
  reconnectPeriod: 10000, // Retry connection every second
};

let lastWriteTime = Date.now(); // Initialize lastWriteTime
const WRITE_INTERVAL = 5000; // 5 seconds write interval

// Function to process a topic and handle messages
function processTopic(topic, message) {
  if (!protobufLoaded) {
    log('Protobuf not loaded yet, skipping message');
    return;
  }

  let decodedMessage;
  try {
    decodedMessage = Payload.decode(message);
  } catch (e) {
    log(`Failed to decode message: ${e}`);
    decodedMessage = { raw: message.toString('hex') };
  }

  if (decodedMessage && decodedMessage.metrics && decodedMessage.metrics[0]) {
    decodedMessage.value = decodedMessage.metrics[0].stringValue;
    const timestamp = decodedMessage.metrics[0].timestamp;
    decodedMessage.timestamp = parseInt(timestamp, 10) + 3600000;
  }

  addTopicToHierarchy(topics, topic, decodedMessage);

  const now = Date.now();
  if (now - lastWriteTime >= WRITE_INTERVAL) {
    try {
      fs.writeFileSync('./app/topicsSparkplug.json', JSON.stringify(topics, null, 2));
      log('Updated topicsSparkplug.json');
      lastWriteTime = now; // Update last write time
    } catch (error) {
      log(`Failed to write updated JSON: ${error}`);
    }
  }
}

// Function to map topic hierarchically
function addTopicToHierarchy(currentNode, topic, data) {
  const levels = topic.split('/');
  
  levels.slice(1).reduce((current, level, index) => {
    if (!current.children) {
      current.children = [];
    }

    let childNode = current.children.find(child => child.name === level);
    if (!childNode) {
      childNode = { name: level, children: [] };
      current.children.push(childNode);
    }

    if (index === levels.length - 2) {
      childNode.value = data.value || JSON.stringify(data);
      childNode.timestamp = data.timestamp || Date.now();
    }

    return childNode;
  }, currentNode);
}

// Function to handle reconnection and reset the client
function reconnect() {
  if (client) {
    client.end();
  }

  client = mqtt.connect(options);

  client.on('connect', () => {
    log('Reconnected to HiveMQ Cloud');
    client.subscribe('#', (err) => {
      if (err) {
        log(`Failed to subscribe after reconnection: ${err}`);
      } else {
        log('Successfully subscribed after reconnection');
      }
    });
  });

  client.on('message', (topic, message) => {
    processTopic(topic, message);
  });

  client.on('reconnect', () => {
    log('Attempting to reconnect...');
  });

  client.on('offline', () => {
    log('Client is offline');
  });

  client.on('error', (error) => {
    log(`Connection error: ${JSON.stringify(error)}`);
    if (error.message.includes('ECONNRESET')) {
      log('Handling ECONNRESET error: reconnecting...');
      reconnect();
    }
  });
}

// Initial connection
reconnect();
