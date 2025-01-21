const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');
const Bottleneck = require('bottleneck');
const supabase = require('../../utils/supabase');
const crawlAndTrack = require('./webCrawAndTrack');

/**
 * Processes a CSV file buffer:
 * - Crawls URLs using Firecrawl and tracks progress in Supabase.
 * - Updates the result tab in the CSV with crawl results after webhook completion.
 *
 * @param {Buffer} fileBuffer - The CSV file as a Buffer.
 * @param {number} batchSize - Number of records to process per batch.
 * @param {string} webhookUrl - Webhook URL for Firecrawl job updates.
 * @returns {Promise<string>} - verdict string.
 */
async function processCsv(fileBuffer, batchSize, webhookUrl) {
    const limiter = new Bottleneck({ minTime: 1000 }); // Limit API calls to 1/second
    const processedRecords = [];
    const parser = parse(fileBuffer, { columns: true });

    for await (const record of parser) {
        processedRecords.push(
            limiter.schedule(async () => {
                try {
                    // Start Firecrawl job
                    const crawlResult = await crawlAndTrack(record.Website || record.Person_Linkedin_Url || '', webhookUrl);

                    if (!crawlResult.success) {
                        throw new Error(`Crawl failed: ${crawlResult.error}`);
                    }

                    console.log(`Firecrawl job started: ${crawlResult.crawlJobId}`);

                    // Store the crawl job ID in the record
                    //record.crawlJobId = crawlResult.crawlJobId;

                    // Insert the initial record into Supabase for later updates
                    // await supabase
                    //     .from('crawl_jobs')
                    //     .insert({
                    //         firecrawl_id: crawlResult.crawlJobId,
                    //         record,
                    //         status: 'started',
                    //     });

                } catch (error) {
                    console.error('Error starting crawl job:', error.message);
                    record.error = error.message;
                }
            })
        );

        if (processedRecords.length === batchSize) {
            await Promise.all(processedRecords);
            processedRecords.length = 0;
        }
    }

    // Process remaining records
    await Promise.all(processedRecords);

    return 'CSV processing started, check Supabase for updates.';
}

module.exports = processCsv;
