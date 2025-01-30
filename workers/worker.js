const { Worker } = require('bullmq');
const supabase = require('../utils/supabase');
const redis = require('../utils/redis');
const ExportService = require('../services/ExportService');
require('dotenv').config();


// Worker instance
const worker = new Worker(
    'jobQueue',
    async (job) => {
        const { 
            userId, 
            uploadedFileId, 
            selected_templates, 
            startRow, 
            maxRows 
        } = job.data;

        console.log(`Processing job: ${job}`);

        try {
            const exportId = await ExportService.processExport(
            userId,
            uploadedFileId,
            selected_templates,
            startRow,
            maxRows
        );

            console.log(`Export ${exportId} is now processing.`);
        } catch (err) {
            console.error(`Error processing export ${job.id}: ${err.message}`);

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
