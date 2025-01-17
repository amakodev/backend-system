# Dockerfile for the worker
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy project files
COPY . .

# Expose a port (optional for monitoring/debugging)
EXPOSE 8080

# Run the worker
CMD ["node", "workers/worker.js"]
