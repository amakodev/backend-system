require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// API Endpoints
app.get('/', (req, res) => res.send('API is running'));

// Routes
//app.use('/auth', require('./routes/auth')); // For authentication
//app.use('/billing', require('./routes/billing')); // For Stripe integration
app.use('/uploads', require('./routes/uploads')); // For file uploads
app.use('/jobs', require('./routes/jobs')); // For job management

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));