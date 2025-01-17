const express = require('express');
const jobQueue = require('../queues/jobQueue');
const supabase = require('../utils/supabase');
const router = express.Router();

// Submit a job for processing
router.post('/submit', async (req, res) => {
    const { fileUrl } = req.body;

    if (!fileUrl) {
        return res.status(400).json({ error: 'File URL is required' });
    }

    try {
        // Add job to queue
        const job = await jobQueue.add('processFile', { fileUrl });

        // Save job metadata to Supabase
        const { data, error } = await supabase
            .from('jobs')
            .insert([{ jobId: job.id, fileUrl, status: 'queued' }]);

        if (error) throw error;

        res.json({ jobId: job.id, message: 'Job submitted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error submitting job' });
    }
});

module.exports = router;
