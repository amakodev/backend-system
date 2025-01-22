const supabase = require('../utils/supabase');
const axios = require('axios');
const csvParser = require('csv-parser');
const { parse } = require('json2csv');
const stream = require('stream');

/**
 * Convert raw CSV string to a stream.
 * @param {string} data - The raw CSV data as a string.
 * @returns {ReadableStream} A readable stream of the data.
 */
const stringToStream = (data) => {
    const readable = new stream.Readable();
    readable.push(data);
    readable.push(null); // Signal end of stream
    return readable;
};

/**
 * Handles Firecrawl webhook updates and uses OpenAI to format data when the crawl is completed.
 */
const handleCrawlWebhook = async (req, res) => {
    const { type, data, error, id, progress, metadata } = req.body;

    try {
        switch (type) {
            case 'crawl.started':
                console.log(`Crawl started for job ID: ${id} | ${JSON.stringify(metadata)}`);

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
                    updated_at: new Date().toISOString(),
                };

                // Update with combined data
                const { error: updateError } = await supabase
                    .from('crawl_jobs')
                    .update(updatedData)
                    .eq('firecrawl_id', id);

                if (updateError) {
                    console.error(`Error fetching existing record: ${fetchError.message}`);
                    throw new Error(`Error fetching existing record: ${fetchError.message}`);
                }

                console.log(`Updated data for job ${id}, total pages: ${updatedData.data.length}`);
                break;

            case 'crawl.completed':
                console.log(`Crawl completed for job ID: ${id}`);

                // Update the database record to mark completion
                const { data: crawlData, error: completeError } = await supabase
                    .from('crawl_jobs')
                    .update({
                        status: 'completed',
                        progress: 100,
                        completed_at: new Date().toISOString(),
                    })
                    .eq('firecrawl_id', id)
                    .select();

                if (completeError) {
                    console.error(`Error updating crawl completion: ${completeError.message}`);
                    throw new Error(`Error updating crawl completion: ${completeError.message}`);
                }

                // Fetch the raw CSV from the file URL
                const { data: jobFile, error: jobFileError } = await supabase
                    .from('jobs')
                    .select('fileUrl')
                    .eq('jobId', crawlData.jobId)
                    .single();

                if (jobFileError) {
                    console.error(`Error fetching job file: ${jobFileError.message}`);
                    throw new Error(`Error fetching job file: ${jobFileError.message}`);
                }

                const rawCsvUrl = jobFile.fileUrl;
                console.log(`Fetching CSV from: ${rawCsvUrl}`);
                const rawCsvResponse = await axios.get(rawCsvUrl);

                const records = [];
                stringToStream(rawCsvResponse.data)
                    .pipe(csvParser())
                    .on('data', (row) => records.push(row))
                    .on('end', async () => {
                        console.log('CSV parsed successfully:', records);

                        // Update records with formatted_data
                        records.forEach((record) => {
                            const crawledRecord = crawlData.find((c) => c.url === record.website);
                            if (crawledRecord) {
                                record.formatted_data = crawledRecord.formatted_data || 'No data';
                            }
                        });

                        // Convert updated records back to CSV
                        const updatedCsv = parse(records);

                        // Re-upload the updated CSV directly to Supabase
                        const filePath = `processed/${crawlData.jobId}.csv`;
                        const { error: uploadError } = await supabase.storage
                            .from('file-uploads')
                            .upload(filePath, stringToStream(updatedCsv), {
                                contentType: 'text/csv',
                            });

                        if (uploadError) {
                            console.error(`Error uploading updated CSV: ${uploadError.message}`);
                            throw new Error(`Error uploading updated CSV: ${uploadError.message}`);
                        } else {
                            console.log('Updated CSV uploaded successfully:', filePath);
                            // Generate a public URL for the uploaded CSV
                            const { data: publicUrlData, error: publicUrlError } = await supabase.storage
                                .from('file-uploads')
                                .getPublicUrl(filePath);

                            if (publicUrlError) {
                                console.error(`Error generating public URL: ${publicUrlError.message}`);
                                throw new Error(`Error generating public URL: ${publicUrlError.message}`);
                            } else {
                                const publicUrl = publicUrlData.publicUrl;
                                console.log('Public URL for the updated CSV:', publicUrl);
                                const { error: publicUrlSaveError } = await supabase
                                    .from('jobs')
                                    .update({ resulturl: publicUrl })
                                    .eq('jobId', crawlData.jobId)

                                if (publicUrlSaveError) {
                                    console.error(`Error saving public URL: ${publicUrlSaveError.message}`);
                                    throw new Error(`Error saving public URL: ${publicUrlSaveError.message}`);
                                }
                            }


                        }
                    })
                    .on('error', (error) => {
                        console.error('Error parsing CSV:', error.message);
                    });
                break;

            case 'crawl.failed':
                console.error(`Crawl failed for job ID: ${id}, error: ${error}`);
                await supabase
                    .from('crawl_jobs')
                    .update({
                        status: 'failed',
                        updated_at: new Date().toISOString(),
                        error_message: error?.message,
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