const supabase = require('../utils/supabase');
const axios = require('axios');

/**
 * Handles Firecrawl webhook updates and uses OpenAI to format data when the crawl is completed.
 */
const handleCrawlWebhook = async (req, res) => {
    const { type, data, error, id, progress, metadata } = req.body;

    try {
        switch (type) {
            case 'crawl.started':
                console.log(`Crawl started for job ID: ${id} | ${metadata}`);

                await supabase
                    .from('crawl_jobs')
                    .update({
                        status: 'crawling',
                        firecrawl_id: id,
                        updated_at: new Date().toISOString(),
                        data: [], // Initialize empty array for data
                        formatted_data: '' // Initialize empty string for formatted data
                    })
                    .eq('id', metadata.recordId);
                break;

            case 'crawl.page':
                console.log(`Page crawled: ${data[0]?.metadata?.title || 'Unknown'}`);

                // First, get the existing data
                const { data: existingRecord, error: fetchError } = await supabase
                    .from('crawl_jobs')
                    .select('data, formatted_data')
                    .eq('firecrawl_id', id)
                    .single();

                if (fetchError) {
                    throw new Error(`Error fetching existing record: ${fetchError.message}`);
                }

                // Format new data
                const newFormattedData = await formatCrawlDataWithOpenAI(data);

                // Combine existing and new data
                const updatedData = {
                    data: existingRecord.data ? [...existingRecord.data, ...data] : data,
                    formatted_data: existingRecord.formatted_data
                        ? existingRecord.formatted_data + '\n\n' + newFormattedData
                        : newFormattedData,
                    progress,
                    last_webhook_type: type,
                    last_webhook_timestamp: new Date().toISOString()
                };

                // Update with combined data
                await supabase
                    .from('crawl_jobs')
                    .update(updatedData)
                    .eq('firecrawl_id', id);

                console.log(`Updated data for job ${id}, total pages: ${updatedData.data.length}`);
                break;

            case 'crawl.completed':
                console.log(`Crawl completed for job ID: ${id}`);
                await supabase
                    .from('crawl_jobs')
                    .update({
                        status: 'completed',
                        progress: 100,
                        last_webhook_type: type,
                        last_webhook_timestamp: new Date().toISOString()
                    })
                    .eq('firecrawl_id', id);
                break;

            case 'crawl.failed':
                console.error(`Crawl failed for job ID: ${id}, error: ${error}`);
                await supabase
                    .from('crawl_jobs')
                    .update({
                        status: 'failed',
                        error,
                        last_webhook_type: type,
                        last_webhook_timestamp: new Date().toISOString()
                    })
                    .eq('firecrawl_id', id);
                break;

            default:
                console.log(`Unhandled webhook event: ${type}`);
        }

        res.status(200).send({ success: true });
    } catch (webhookError) {
        console.error('Error handling webhook:', webhookError.message);
        res.status(500).send({ success: false, error: webhookError.message });
    }
};

/**
 * Formats crawled data using OpenAI.
 * @param {Object[]} crawledData - The data received from the crawl.
 * @returns {Promise<string>} - The formatted data as a string.
 */
const formatCrawlDataWithOpenAI = async (crawledData) => {
    try {
        const openAiResponse = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are a data formatter. Given raw crawled data, return a well-structured and human-readable  1 sentence summary.',
                    },
                    { role: 'user', content: JSON.stringify(crawledData) },
                ],
            },
            {
                headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
            }
        );

        const formattedResult = openAiResponse.data.choices[0].message.content;
        console.log('Formatted data:', formattedResult);
        return formattedResult;
    } catch (error) {
        console.error('Error formatting data with OpenAI:', error.message);
        return `Failed to format data: ${error.message}`;
    }
};

module.exports = handleCrawlWebhook;