const supabase = require("../utils/supabase");
const { processWebsites, processPersonalizations } = require('./processWebsites');
const { handleCreditTransaction } = require('./creditService');

class ExportService {
    constructor() { }

    async processExport(userId, uploadedFileId, selected_templates, startRow = 0, maxRows = null) {
        try {
            // Fetch file data
            const { data: fileData, error: fileError } = await supabase
                .from('file_uploads')
                .select('data, id')
                .eq('id', uploadedFileId)
                .single();

            if (fileError || !fileData?.data) {
                throw new Error('No file data found');
            }

            const originalData = fileData.data;
            const selectedData = maxRows
                ? originalData.slice(startRow, startRow + maxRows)
                : originalData.slice(startRow);

            const export_website_urls = selectedData.map(row =>
                row.Website || row.website || row.URL || row.url
            ).filter(Boolean);

            if (!(export_website_urls.length > 0)) {
                throw new Error('Nothing To Export!');
            }

            // Initialize Export
            const { data: initData, error: initError } = await supabase
                .from('export_jobs')
                .insert({
                    user_id: userId,
                    file_id: fileData.id,
                    selected_templates,
                    processed_rows: 0,
                    total_rows: selectedData.length,
                    website_urls: export_website_urls,
                    status: 'processing',
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (initError) {
                throw new Error('Failed To Initialize Export');
            }

            // Process the export asynchronously
            this.processExportAsync(initData, selectedData, export_website_urls, userId, selected_templates);

            return initData.id;
        } catch (error) {
            console.error('Export initialization error:', error);
            throw error;
        }
    }

    async processExportAsync(initData, selectedData, export_website_urls, userId, selected_templates) {
        try {
            const processedSites = await processWebsites(export_website_urls, export_website_urls.length, false, initData?.id);
            processedSites && await processPersonalizations(initData, processedSites);

            const rowData = await Promise.all(
                selectedData.map(async (row) => {
                    const webUrl = row.Website || row.website || row.URL || row.url;

                    const { data: websiteCrawl } = await supabase
                        .from('website_crawls')
                        .select('summary')
                        .eq('url', webUrl)
                        .single();

                    if (!websiteCrawl) {
                        return {
                            ...row,
                            summary: 'No Summary Found',
                            ...Object.fromEntries(selected_templates.map(key => [key, 'No Personalization Found']))
                        };
                    }

                    const { data: exportDataCache } = await supabase
                        .from('personalization_cache')
                        .select('personalizations')
                        .eq('user_id', userId)
                        .eq('url', webUrl)
                        .single();

                    if (!exportDataCache) {
                        return {
                            ...row,
                            summary: websiteCrawl.summary,
                            ...Object.fromEntries(selected_templates.map(key => [key, 'No Personalization Found']))
                        };
                    }

                    const filteredPersonalizations = Object.fromEntries(
                        Object.entries(exportDataCache.personalizations || {})
                            .filter(([key]) => selected_templates.includes(key))
                    );

                    return {
                        ...row,
                        summary: websiteCrawl.summary,
                        ...filteredPersonalizations
                    };
                })
            );

            // Update export job with results
            await supabase
                .from('export_jobs')
                .update({
                    processed_rows: rowData.length,
                    row_data: rowData,
                    status: 'completed',
                    estimated_completion_time: new Date().toISOString(),
                    credits_used: rowData.length // Add this field to track credits used
                })
                .eq('id', initData.id);

            // Deduct credits for successfully processed rows
            await handleCreditTransaction({
                user_id: userId,
                type: 'debit',
                amount: rowData.length,
                reason: `Export job ${initData.id}: ${rowData.length} rows processed`
            });

        } catch (error) {
            console.error('Export processing error:', error);
            await supabase
                .from('export_jobs')
                .update({
                    error_message: error.message,
                    status: 'failed'
                })
                .eq('id', initData.id);
        }
    }
}

// Export a singleton instance
module.exports = new ExportService();