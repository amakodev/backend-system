const FirecrawlApp = require('@mendable/firecrawl-js');
const supabase = require('../../utils/supabase');

// Initialize Firecrawl
const firecrawl = new FirecrawlApp.default({ apiKey: process.env.FIRECRAWL_API_KEY });

/**
 * Creates and tracks a crawl job for a given URL
 * @param {string} url - The URL to crawl
 * @param {string} webhookUrl - Webhook URL for crawl notifications
 * @returns {Promise<Object>} Result object with success status and relevant data
 */
const crawlAndTrack = async (jobId, url, webhookUrl) => {
    let crawlRecord = null;
    
    console.log(`Attempting to Crawl ${url}`);
    
    try {
        // Basic input validation
        if (!url || typeof url !== 'string') {
            throw new Error('Invalid URL provided');
        }

        // Insert initial crawl record in Supabase
        const { data, error: insertError } = await supabase
            .from('crawl_jobs')
            .insert([{ 
                jobId,
                url, 
                status: 'started', 
                progress: 0,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (insertError?.message) {
            console.error('Error inserting crawl record:', insertError);
            throw new Error(`Failed to create crawl record: ${insertError.message}`);
        }

        if (!data) {
            throw new Error('No crawl record was created');
        }

        crawlRecord = data;
        console.log(`Crawl record created with ID: ${crawlRecord.id}`);

        // Start the Firecrawl job
        const crawlResponse = await firecrawl.asyncCrawlUrl(url, {
            webhook: {
                url: webhookUrl,
                metadata: {
                    recordId: crawlRecord.id
                }
            },
            limit: 1,
            scrapeOptions: { formats: ['markdown'] }
        });
        console.log({crawlResponse});

        if (!crawlResponse || !crawlResponse.success) {
            console.error(`Firecrawl job failed: ${crawlResponse?.error || 'Unknown error'}`)
            throw new Error(`Firecrawl job failed: ${crawlResponse?.error || 'Unknown error'}`);
        }

        //console.log('Craw-ID',crawlResponse.id)

        // Update crawl record with Firecrawl ID
        // const { error: updateError } = await supabase
        //     .from('crawl_jobs')
        //     .update({ 
        //         firecrawl_id: crawlResponse.id,
        //         status: 'crawling',
        //         updated_at: new Date().toISOString()
        //     })
        //     .eq('id', crawlRecord.id);

        // if (updateError?.message) {
        //     console.error('Error updating crawl record:', updateError);
        //     throw new Error(`Failed to update crawl record: ${updateError.message}`);
        // }

        console.log(`Crawl job started with ID: ${crawlResponse.id}`);
        console.log('Webhook setup complete. Listening for events.');

        return { 
            success: true, 
            crawlJobId: crawlResponse.id,
            recordId: crawlRecord.id
        };

    } catch (error) {
        console.error('Crawl operation failed:', error);

        // If we have a crawl record, update it with the error status
        if (crawlRecord?.id) {
            try {
                await supabase
                    .from('crawl_jobs')
                    .update({ 
                        status: 'failed',
                        error_message: error.message,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', crawlRecord.id);
            } catch (updateError) {
                console.error('Failed to update error status:', updateError);
            }
        }

        return { 
            success: false, 
            error: error.message,
            recordId: crawlRecord?.id
        };
    }
};

module.exports = crawlAndTrack;