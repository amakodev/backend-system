const { Worker } = require('bullmq');
const supabase = require('../utils/supabase');
const redis = require('../utils/redis');
const axios = require('axios'); // To download the file
const processCsv = require('./utils/processCsv'); // Import CSV processing logic
require('dotenv').config();

const webhookUrl = `${"https://jeff-backend-aftatfgm9-adrins-projects-0327ced1.vercel.app"}/update/crawl_status`;

// Worker instance
const worker = new Worker(
    'jobQueue',
    async (job) => {
        const { fileUrl } = job.data;

        console.log(`Processing file: ${fileUrl}`);

        try {
            // Download the file
            const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
            const fileBuffer = Buffer.from(response.data);

            // Trigger CSV processing (returns confirmation message, actual processing via webhook)
            const batchSize = 50;
            const confirmationMessage = await processCsv(job.id, fileBuffer, batchSize, webhookUrl);

            console.log(`Processing initiated: ${confirmationMessage}`);

            // Update job status in Supabase to indicate processing has started
            const { error: updateError } = await supabase
                .from('jobs')
                .update({ status: confirmationMessage })
                .eq('jobId', job.id);

            if (updateError) throw updateError;

            console.log(`Job ${job.id} is now processing.`);
        } catch (err) {
            console.error(`Error processing job ${job.id}: ${err.message}`);

            // Update job status in Supabase to indicate failure
            await supabase
                .from('jobs')
                .update({ status: `failed: ${err.message}s` })
                .eq('jobId', job.id)
                .catch(console.error);

            throw err; // Triggers the `failed` event
        }
    },
    { connection: redis }
);

// Handle worker events
worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed.`);
});

worker.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed:`, err);

    // Update job status in Supabase
    supabase
        .from('jobs')
        .update({ status: 'failed' })
        .eq('jobId', job.id)
        .catch(console.error);
});

console.log('Worker is running...');
