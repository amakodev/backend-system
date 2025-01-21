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
const crawlAndTrack = async (url, webhookUrl) => {
    let crawlRecord = null;
    
    console.log(`Attempting to Crawl ${url}`);
    
    try {
        // Basic input validation
        if (!url || typeof url !== 'string') {
            throw new Error('Invalid URL provided');
        }

        // First, try to insert without .select() to verify insert works
        const insertResult = await supabase
            .from('crawl_jobs')
            .insert([{ 
                url, 
                status: 'started', 
                progress: 0,
                created_at: new Date().toISOString()
            }]);

        console.log('Initial insert result:', insertResult);

        if (insertResult.error) {
            throw new Error(`Insert failed: ${insertResult.error.message || 'Unknown error'}`);
        }

        // Now fetch the record we just inserted
        const { data: fetchedRecord, error: fetchError } = await supabase
            .from('crawl_jobs')
            .select('*')
            .eq('url', url)
            .eq('status', 'started')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (fetchError) {
            throw new Error(`Failed to fetch inserted record: ${fetchError.message}`);
        }

        if (!fetchedRecord) {
            throw new Error('Failed to retrieve the inserted record');
        }

        crawlRecord = fetchedRecord;
        console.log(`Successfully retrieved crawl record with ID: ${crawlRecord.id}`);

        // Start the Firecrawl job
        console.log('Starting Firecrawl job...');
        const crawlResponse = await firecrawl.crawlUrl(url, {
            webhook: webhookUrl,
            limit: 2,
            scrapeOptions: { formats: ['markdown'] }
        });

        console.log('Firecrawl response:', crawlResponse);

        if (!crawlResponse || !crawlResponse.success) {
            throw new Error(`Firecrawl job failed: ${crawlResponse?.error || 'Unknown error'}`);
        }

        // Update crawl record with Firecrawl ID
        const { error: updateError } = await supabase
            .from('crawl_jobs')
            .update({ 
                firecrawl_id: crawlResponse.id,
                status: 'crawling',
                updated_at: new Date().toISOString()
            })
            .eq('id', crawlRecord.id);

        if (updateError) {
            throw new Error(`Failed to update crawl record: ${updateError.message}`);
        }

        console.log(`Crawl job started with ID: ${crawlResponse.id}`);
        console.log('Webhook setup complete. Listening for events.');

        return { 
            success: true, 
            crawlJobId: crawlResponse.id,
            recordId: crawlRecord.id
        };

    } catch (error) {
        console.error('Operation failed:', {
            error: error.message,
            stack: error.stack,
            context: crawlRecord ? `Had crawl record with ID ${crawlRecord.id}` : 'No crawl record created'
        });

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