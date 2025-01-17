const { Worker } = require('bullmq');
const supabase = require('../utils/supabase');
const redis = require('../utils/redis');
const axios = require('axios'); // To download the file
const fs = require('fs'); // To write the processed file locally
const path = require('path');
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
            const editedCsv = await processCsv(fileBuffer);

            // Save the edited CSV locally
            const outputFilePath = path.resolve(__dirname, `../output/${job.id}.csv`);
            fs.writeFileSync(outputFilePath, editedCsv);

            // Optionally upload the edited CSV back to Supabase
            const { data, error: uploadError } = await supabase.storage
                .from('file-uploads')
                .upload(`processed/${job.id}.csv`, fs.readFileSync(outputFilePath), {
                    contentType: 'text/csv',
                    upsert: true,
                });

            if (uploadError) throw uploadError;

            // Update job status in Supabase
            const { error: updateError } = await supabase
                .from('jobs')
                .update({ status: 'completed', resultUrl: data.path })
                .eq('jobId', job.id);

            if (updateError) throw updateError;

            console.log(`File processed successfully: ${fileUrl}`);
        } catch (err) {
            console.error(`Error processing file: ${err.message}`);
            throw err; // This triggers the `failed` event
        }
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

console.log('Worker is running...');
