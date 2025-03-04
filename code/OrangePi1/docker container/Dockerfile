FROM node:16

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Copy application files
COPY app ./app

# Install a lightweight web server for the static dashboard
RUN npm install -g serve

# Expose the port for the web server and MQTT updates
EXPOSE 3000
EXPOSE 8883

# Start both the Node.js script and static file server
CMD ["sh", "-c", "node app/app.js & serve -s app -l 3000"]
