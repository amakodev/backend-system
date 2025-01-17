const { Worker } = require('bullmq');
const supabase = require('../utils/supabase');
const redis = require('../utils/redis');
const axios = require('axios'); // To download the file
const processCsv = require('./utils/processCsv'); // Import CSV processing logic

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

            // Process the CSV file
            const editedCsv = await processCsv(fileBuffer); // `editedCsv` is now a string or buffer

            // Upload the processed CSV directly to Supabase
            const fileName = `processed/${job.id}.csv`;
            const { data, error: uploadError } = await supabase.storage
                .from('file-uploads')
                .upload(fileName, editedCsv, {
                    contentType: 'text/csv',
                    upsert: true,
                });

            if (uploadError) throw uploadError;

            console.log(`Uploaded processed file to Supabase: ${fileName}`);

            // Update job status in Supabase with the file URL
            const { error: updateError } = await supabase
                .from('jobs')
                .update({ status: 'completed', resultUrl: data.path })
                .eq('jobId', job.id);

            if (updateError) throw updateError;

            console.log(`Job ${job.id} processed successfully.`);
        } catch (err) {
            console.error(`Error processing job ${job.id}: ${err.message}`);
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
