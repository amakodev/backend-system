const { Queue } = require('bullmq');
const redis = require('../utils/redis');

const jobQueue = new Queue('jobQueue', { connection: redis });

module.exports = jobQueue;
