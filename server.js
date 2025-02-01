require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const handleCrawlWebhook = require('./webhooks/crawlWebhook');

const app = express();


app.use(cors({
    origin: ['http://localhost:8080', 'https://heystranger.ai'], // Add all allowed origins
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
app.use(bodyParser.json({ limit: '50mb' })); 

// API Endpoints
app.get('/', (req, res) => res.send('API is running'));

//Crawl Webhook
app.post('/update/crawl_status', handleCrawlWebhook);

// Routes
//app.use('/auth', require('./routes/auth')); // For authentication
//app.use('/billing', require('./routes/billing')); // For Stripe integration
app.use('/uploads', require('./routes/uploads')); // For file uploads
app.use('/jobs', require('./routes/jobs')); // For job management
app.use('/websites', require('./routes/processing')); // For file uploads
app.use('/exports', require('./routes/exports')); // For job management

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;