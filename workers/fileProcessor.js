const { Worker } = require('bullmq');
const supabase = require('../utils/supabase');
const redis = require('../utils/redis');

// Worker instance
const worker = new Worker(
    'jobQueue',
    async (job) => {
        const { fileUrl } = job.data;

        console.log(`Processing file: ${fileUrl}`);

        // Simulate processing (replace with actual logic)
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Update job status in Supabase
        const { error } = await supabase
            .from('jobs')
            .update({ status: 'completed' })
            .eq('jobId', job.id);

        if (error) throw error;

        console.log(`File processed successfully: ${fileUrl}`);
    },
    { connection: redis }
);

// Handle worker events
worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
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
