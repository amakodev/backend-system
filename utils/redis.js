const Redis = require('ioredis');

// Connect to Redis using the URL from the environment variables
const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: true,    // Ensures Redis is ready before using it
  });

// Log connection events
redis.on('connect', () => console.log('Connected to Redis'));
redis.on('error', (err) => console.error('Redis error:', err));

module.exports = redis;
