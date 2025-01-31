// src/routes/websites.js
const express = require('express');
const router = express.Router();
const { fetchWebsiteData, getCacheData, processWebsites } = require('../services/processWebsites');


// GET /api/websites/data
router.get('/data', async (req, res) => {
    try {
        const { websites, limit } = req.query;
        const websiteList = JSON.parse(websites);

        const data = await fetchWebsiteData(websiteList, limit);
        res.json({ data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/websites/cache
router.get('/cache', async (req, res) => {
    try {
        const { websites } = req.query;
        const websiteList = JSON.parse(websites);

        if (!websiteList?.length) {
            return res.status(400).json({ error: 'No websites provided' });
        }

        const cachedUrls = await getCacheData(websiteList);

        res.json({ data: cachedUrls });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/websites/process
router.post('/process', async (req, res) => {
    try {
        const { websites, totalRows = 10, updateSummary = false } = req.body;
        
        if (!websites?.length) {
            return res.status(400).json({ error: 'No websites provided' });
        }

        const results = await processWebsites(websites, totalRows, updateSummary);

        res.json({ data: results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/websites/personalization
router.post('/generate-personalizations', async (req, res) => {
    try {
        const { userId, websiteData, type, prompt } = req.body;

        const results = await handleGeneratePersonalization(userId, websiteData, type, prompt);
        res.json({ data: results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;