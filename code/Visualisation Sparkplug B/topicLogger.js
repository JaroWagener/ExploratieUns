const mqtt = require('mqtt');
const fs = require('fs');
const protobuf = require('protobufjs');

// Load the Sparkplug B protobuf definition
const SPARKPLUG_PROTO_PATH = './sparkplug_b.proto';
let Payload;
protobuf.load(SPARKPLUG_PROTO_PATH, (err, root) => {
  if (err) {
    throw err;
  }
  Payload = root.lookupType("org.eclipse.tahu.protobuf.Payload");
});

const options = {
  host: '<your-host>',
  port: 8883,
  protocol: 'mqtts',
  username: '<username>',
  password: '<password>'
};

const client = mqtt.connect(options);

let topics = { name: "spBv1.0", children: [] };

client.on('connect', () => {
  console.log('Connected to HiveMQ Cloud');

  client.subscribe('#', (err) => {
    if (err) {
      console.error('Failed to subscribe to topics:', err);
    } else {
      console.log('Subscribed to all topics');
    }
  });
});

try {
client.on('message', (topic, message) => {
  console.log(`Received message on topic ${topic}`);

  // Try to decode the binary payload
  let decodedMessage;
  try {
    if (Payload) {
      decodedMessage = Payload.decode(message);
      console.log(`Decoded message: ${JSON.stringify(decodedMessage, null, 2)}`);
    } else {
      throw new Error('Protobuf Payload not loaded yet.');
    }
  } catch (e) {
    console.error('Failed to decode binary message:', e);
    decodedMessage = { raw: message.toString('hex') }; // Show raw binary data as fallback
  }

  // Extract the value (stringValue) from the decoded message
  if (decodedMessage && decodedMessage.metrics && decodedMessage.metrics[0]) {
    decodedMessage.value = decodedMessage.metrics[0].stringValue;
  }

  // Extract timestamp properly
  if (decodedMessage && decodedMessage.metrics && decodedMessage.metrics[0] && decodedMessage.metrics[0].timestamp) {
    const timestamp = decodedMessage.metrics[0].timestamp;
    
    // If timestamp is in low/high format (i.e., 64-bit as separate low and high parts)
    if (timestamp.low !== undefined && timestamp.high !== undefined) {
      decodedMessage.timestamp = timestamp.low + (timestamp.high * Math.pow(2, 32)); // Combine the low and high parts to form a 64-bit timestamp
    } else {
      decodedMessage.timestamp = timestamp; // Use the timestamp as it is if it's already a single value
    }
  }

  addTopicToHierarchy(topics, topic, decodedMessage);

  try {
    fs.writeFileSync('topicsSparkplug.json', JSON.stringify(topics, null, 2));
    console.log('Updated topicsSparkplug.json');
  } catch (writeError) {
    console.error('Error writing topicsSparkplug.json:', writeError);
  }
});
}
catch(error){ console.log(error)}

try
{
// Modify the function to handle "Sleutel" properly without top-level value and timestamp
function addTopicToHierarchy(currentNode, topic, data) {
  const levels = topic.split('/');

  // Skip the first level as it is already represented in the root
  levels.slice(1).reduce((current, level, index) => {
    if (!current.children) {
      current.children = [];
    }

    let childNode = current.children.find(child => child.name === level);
    if (!childNode) {
      childNode = { name: level, children: [] };
      current.children.push(childNode);
    }

    if (index === levels.length - 2) { // Last level of the reduced array (leaf node)
      if (level !== "Sleutel") {  // Don't add value and timestamp for "Sleutel"
        childNode.value = data.value || JSON.stringify(data);
        childNode.timestamp = data.timestamp || Date.now();
      }
      delete childNode.children; // Remove children property for leaf nodes
    }

    // Special handling for "Sleutel" to create the correct structure
    if (level === "Sleutel") {
      if (!childNode.children) {
        childNode.children = []; // Create a children array for "Sleutel"
      }
      let sensorNode = childNode.children.find(child => child.name === "Sensor1");
      if (!sensorNode) {
        sensorNode = { name: "Sensor1", value: data.value, timestamp: data.timestamp };
        childNode.children.push(sensorNode);
      }
    }

    return childNode;
  }, currentNode);
}

client.on('error', (error) => {
  console.error('Connection error:', error);
  client.end();
  const client = mqtt.connect(options);
});
}
catch(error) {console.log(error)}
