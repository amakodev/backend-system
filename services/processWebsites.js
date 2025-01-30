const supabase = require("../utils/supabase");
const AIService = require("./AIService");
const { FirecrawlService } = require("./FirecrawlService");

const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW = 60000;

const fetchWebsiteData = async (websites, limit) => {
    if (!websites?.length) return;

    let query = supabase
        .from('website_crawls')
        .select()
        .in('url', websites.slice(0, limit))
        .order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching website data:', error);
        return;
    }
    return data;
}

const getCacheData = async (website_list) => {
    if (!(website_list?.length > 0)) return;
    const cachedResults = await Promise.all(
        website_list.map(async (url) => {
            const { data: cachedData } = await supabase
                .from('website_crawls')
                .select('crawl_data')
                .eq('url', url)
                .single();
            return { url, cached: !!cachedData?.crawl_data };
        })
    );

    return cachedResults.filter(result => result.cached).map(result => result.url);
}

const updateSupabaseAndState = async (url, data) => {
    try {
        const { data: existingRecord, error: existingRecordError } = await supabase
            .from('website_crawls')
            .select('*')
            .eq('url', url)
            .single();

        const upsertData = {
            url,
            ...(existingRecord || {}),
            ...data,
            updated_at: new Date().toISOString()
        };

        const { data: updatedData, error } = await supabase
            .from('website_crawls')
            .upsert(upsertData)
            .eq('url', url)
            .select()
            .single();

        if (error) throw error;

        console.log(`Updated upsert data for ${url}`, updatedData);
        return updatedData;
    } catch (err) {
        console.error('Error updating Supabase:', err);
        return null;
    }
};

const updateExportPersonalizations = async (userId, url, personalizations) => {
    try {
        const { data: existingRecord, error: existingRecordError } = await supabase
            .from('personalization_cache')
            .select()
            .eq('url', url)
            .eq('user_id', userId)
            .single();

        console.log(`Existing personalization for ${url}`, existingRecord);

        const initData = {
            user_id: userId,
            url,
            created_at: new Date().toISOString()
        }

        const updatedPersonalizations = {
            ...initData,
            ...existingRecord,
            personalizations: {
                ...existingRecord?.personalizations,
                ...personalizations
            }
        };

        const { data: updatedRecord, error: updatedRecordError } = await supabase
            .from('personalization_cache')
            .upsert(updatedPersonalizations)
            .eq('url', url)
            .eq('user_id', userId)
            .select()
            .single();

        if (updatedRecordError) console.log('Update Error', updatedRecordError.message);

        console.log(`Updated personalizations for website ${url}, for ${userId}`, updatedRecord);
        return updatedRecord;
    } catch (err) {
        console.error('Error updating export personilizations:', err);
        return null;
    }
};

const processWebsites = async (websites, totalRows = 10, updateSummary, jobId) => {
    if (!websites.length) return;

    const queue = websites.slice(0, totalRows);
    let lastRequestTime = 0;
    const results = [];
    
    for (const url of queue) {
        try {
            const { data: cachedData } = await supabase
                .from('website_crawls')
                .select('*')
                .eq('url', url)
                .single();

            if (Array.isArray(cachedData?.crawl_data) && cachedData.crawl_data.length > 0) {
                if (cachedData?.isLoading || !(cachedData?.summary) || updateSummary) {
                    const summary = await AIService.analyzeWebsite(cachedData.crawl_data, "summary");
                    const faviconUrl = `https://www.google.com/s2/favicons?domain=${url}&sz=128`;

                    const updatedSite = await updateSupabaseAndState(url, {
                        summary,
                        favicon: faviconUrl,
                        isLoading: false,
                    });
                    results.push(updatedSite);
                    continue;
                }
                results.push(cachedData);
                continue;
            }

            const now = Date.now();
            const timeSinceLastRequest = now - lastRequestTime;
            const minimumDelay = RATE_LIMIT_WINDOW / (RATE_LIMIT - 1);

            if (timeSinceLastRequest < minimumDelay) {
                const delayNeeded = minimumDelay - timeSinceLastRequest;
                console.log(`Rate limiting: Waiting ${delayNeeded}ms before processing ${url}`);
                await new Promise(resolve => setTimeout(resolve, delayNeeded));
            }

            lastRequestTime = Date.now();

            const result = await FirecrawlService.crawlWebsite(url);

            if (result.success) {
                const summary = await AIService.analyzeWebsite(result.data.data, "summary");
                const faviconUrl = `https://www.google.com/s2/favicons?domain=${url}&sz=128`;

                const updatedSite = await updateSupabaseAndState(url, {
                    crawl_data: result.data.data,
                    word_count: JSON.stringify(result.data.data).split(/\s+/).length,
                    summary,
                    favicon: faviconUrl,
                    isLoading: false,
                });
                results.push(updatedSite);
            } else {
                throw new Error(result.error);
            }

            await supabase
            .from('export_jobs')
            .update({
                processed_rows: results.length,
            })
            .eq('id', jobId);
        } catch (error) {
            console.error(`Error processing website ${url}:`, error);
            
            if (error.message?.includes('Rate limit exceeded')) {
                const resetTimeMatch = error.message.match(/retry after (\d+)s/);
                if (resetTimeMatch) {
                    const resetSeconds = parseInt(resetTimeMatch[1]) + 1;
                    console.log(`Rate limit hit. Pausing for ${resetSeconds} seconds`);
                    await new Promise(resolve => setTimeout(resolve, resetSeconds * 1000));
                    
                    queue.push(url);
                    continue;
                }
            }
            console.log(`Failed to process ${url}`);
        }
    }

    return results;
};

const handleGeneratePersonalization = async (userId, websiteData, type, prompt) => {
    const processingPromises = websiteData.map(async (site, index) => {
        if (!(site?.crawl_data) || !(site?.url)) return;

        try {
            const result = await AIService.analyzeWebsite(site.crawl_data, type, prompt);

            updateExportPersonalizations(userId, site.url, {
                [type]: result
            });

            console.log('Personalization Loaded', { userId, type, site, result });
        } catch (error) {
            console.error(`Error generating ${type} for ${site.url}:`, error);
        }
    });

    await Promise.all(processingPromises);
};

const processPersonalizations = async (initData, websiteData) => {
    console.log("Processing Personalizations", {websiteData});
    const { id, selected_templates, user_id } = initData || {};
    
    if (!id || !selected_templates) {
        throw new Error("Invalid ExportJob parameters to process personalizations");
    }

    const validWebsites = websiteData.filter(site => site?.crawl_data && site?.url);
    let i = 0;
    

    for (const site of validWebsites) {
        try {
            if (selected_templates?.length > 0) {
                const templateResults = [];
                for (const type of selected_templates) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    const personalization = await AIService.analyzeWebsite(site.crawl_data, type);
                    templateResults.push({ type, personalization });
                }

                const _exportTemplates = templateResults.reduce((acc, { type, personalization }) => ({
                    ...acc,
                    [type]: personalization
                }), {});

                console.log('Personalization Processing', { site, selected_templates, _exportTemplates });

                site.url && await updateExportPersonalizations(user_id, site.url, _exportTemplates);

                console.log('Personalization Loaded', { 
                    exportID: id, 
                    selected_templates, 
                    site, 
                    result: _exportTemplates 
                });

                await supabase
                .from('export_jobs')
                .update({
                    processed_rows: ++i,
                })
                .eq('id', id);
            }
        } catch (error) {
            console.error(`Error generating personalizations for ${site.url}:`, error);
        }
    }
};

module.exports = {
    fetchWebsiteData,
    getCacheData,
    processWebsites,
    handleGeneratePersonalization,
    processPersonalizations
};