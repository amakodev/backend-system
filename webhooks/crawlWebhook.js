const supabase = require('../utils/supabase');
const axios = require('axios');

/**
 * Handles Firecrawl webhook updates and uses OpenAI to format data when the crawl is completed.
 */
const handleCrawlWebhook = async (req, res) => {
    const { type, data, error, id, progress } = req.body;

    try {
        switch (type) {
            case 'crawl.started':
                console.log(`Crawl started for job ID: ${id}`);
                await supabase
                    .from('crawl_jobs')
                    .update({ status: 'crawl started' })
                    .eq('firecrawl_id', id);
                break;

            case 'crawl.page':
                console.log(`Page crawled: ${data[0]?.metadata?.title || 'Unknown'}`);
                await supabase
                    .from('crawl_jobs')
                    .update({ progress, data })
                    .eq('firecrawl_id', id);
                break;

            case 'crawl.completed':
                console.log(`Crawl completed for job ID: ${id}`);
                const formattedData = await formatCrawlDataWithOpenAI(data);

                await supabase
                    .from('crawl_jobs')
                    .update({
                        status: 'completed',
                        progress: 100,
                        formatted_data: formattedData,
                    })
                    .eq('firecrawl_id', id);
                break;

            case 'crawl.failed':
                console.error(`Crawl failed for job ID: ${id}, error: ${error}`);
                await supabase
                    .from('crawl_jobs')
                    .update({ status: 'failed', error })
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
                            'You are a data formatter. Given raw crawled data, return a well-structured and human-readable summary.',
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
