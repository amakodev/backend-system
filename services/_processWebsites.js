const supabase = require("../utils/supabase");
const AIService = require("./AIService");
const { FirecrawlService } = require("./FirecrawlService");
const redis = require("../utils/redis");

const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW = 60000;

const RATE_LIMIT_TRACKER = {
    requests: 0,
    resetTime: Date.now(),
    
    async checkAndWait() {
        const now = Date.now();
        if (now - this.resetTime >= RATE_LIMIT_WINDOW) {
            this.requests = 0;
            this.resetTime = now;
        }
        
        if (this.requests >= RATE_LIMIT) {
            const waitTime = RATE_LIMIT_WINDOW - (now - this.resetTime);
            if (waitTime > 0) {
                console.log(`Rate limit reached, waiting ${waitTime}ms`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                this.requests = 0;
                this.resetTime = Date.now();
            }
        }
        
        this.requests++;
    }
};

const fetchWebsiteData = async (websites, limit = 10) => {
    if (!websites?.length) return { data: [], remainingUrls: [] };

    const websitesToProcess = websites.slice(0, limit);

    let query = supabase
        .from('website_crawls')
        .select()
        .in('url', websitesToProcess)
        .order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching website data:', error);
        return { data: [], remainingUrls: websitesToProcess };
    }

    // Get existing URLs from the data
    const existingUrls = new Set(data?.map(item => item.url) || []);
    
    // Find URLs that don't have data yet (only from the first 50)
    const remainingUrls = websitesToProcess.filter(url => !existingUrls.has(url));

    return {
        data: data?.slice(0, limit) || [],
        remainingUrls
    };
}

const getCacheData = async (website_list) => {
    if (!(website_list?.length > 0)) return [];
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
            ...existingRecord,
            ...initData,
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

const checkCache = async (url) => {
    const cacheKey = `website_cache:${url}`;
    // Add Redis or similar for faster cache lookups
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
        return JSON.parse(cachedData);
    }
    return null;
};

const processWebsites = async (websites, totalRows = 10, updateSummary, jobId = null) => {
    if (!websites.length) return;

    const queue = websites.slice(0, totalRows);
    const results = [];
    const batchSize = RATE_LIMIT;
    
    for (let i = 0; i < queue.length; i += batchSize) {
        const batch = queue.slice(i, i + batchSize);
        const batchPromises = batch.map(async (url) => {
            try {
                await RATE_LIMIT_TRACKER.checkAndWait();
                
                // Check cache first
                const cachedData = await checkCache(url);
                if (cachedData) return cachedData;
                
                // Process new website
                await RATE_LIMIT_TRACKER.checkAndWait();
                const result = await FirecrawlService.crawlWebsite(url);
                
                if (result.success) {
                    await RATE_LIMIT_TRACKER.checkAndWait();
                    const summary = await AIService.analyzeWebsite(result.data.data, "summary");
                    
                    return updateSupabaseAndState(url, {
                        crawl_data: result.data.data,
                        summary,
                        // ... other fields
                    });
                }
            } catch (error) {
                console.error(`Error processing ${url}:`, error);
                return {
                    url,
                    error: error.message
                };
            }
        });

        // Process batch with smart rate limiting
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.filter(Boolean));
        
        // Update progress
        if (jobId) {
            await updateProgress(jobId, results.length);
        }
    }

    return results;
};

const handleGeneratePersonalization = async (userId, websiteData, type, prompt) => {
    try {
        const processingPromises = websiteData.map(async (site, index) => {
            if (!(site?.crawl_data) || !(site?.url)) return;

            try {
                const result = await AIService.analyzeWebsite(site.crawl_data, type, prompt);
                await updateExportPersonalizations(userId, site.url, {
                    [type]: result
                });
                console.log('Personalization Loaded', { userId, type, site, result });
            } catch (error) {
                console.error(`Error generating ${type} for ${site.url}:`, error);
                await updateExportPersonalizations(userId, site.url, {
                    [`${type}_error`]: error.message
                });
            }
        });

        await Promise.all(processingPromises);
    } catch (error) {
        console.error('Fatal error in handleGeneratePersonalization:', error);
        throw error;
    }
};

const processPersonalizations = async (initData, websiteData) => {
    console.log("Processing Personalizations", { websiteData });
    const { id, selected_templates, user_id } = initData || {};

    if (!id || !selected_templates) {
        throw new Error("Invalid ExportJob parameters to process personalizations");
    }

    const validWebsites = websiteData.filter(site => site?.crawl_data && site?.url);
    const batchSize = RATE_LIMIT;
    let processedCount = 0;

    // Process websites in batches
    for (let i = 0; i < validWebsites.length; i += batchSize) {
        const batch = validWebsites.slice(i, i + batchSize);
        
        // Process all templates for each website in the batch concurrently
        const batchPromises = batch.map(async (site) => {
            try {
                if (selected_templates?.length > 0) {
                    const templatePromises = selected_templates.map(async (type) => {
                        const personalization = await AIService.analyzeWebsite(site.crawl_data, type);
                        return { type, personalization };
                    });

                    // Process all templates for this website concurrently
                    const templateResults = await Promise.all(templatePromises);

                    const _exportTemplates = templateResults.reduce((acc, { type, personalization }) => ({
                        ...acc,
                        [type]: personalization
                    }), {});

                    console.log('Personalization Processing', { site, selected_templates, _exportTemplates });

                    if (site.url) {
                        await updateExportPersonalizations(user_id, site.url, _exportTemplates);
                    }

                    console.log('Personalization Loaded', {
                        exportID: id,
                        selected_templates,
                        site,
                        result: _exportTemplates
                    });
                }
            } catch (error) {
                console.error(`Error generating personalizations for ${site.url}:`, error);
            }
        });

        // Process the entire batch
        await Promise.all(batchPromises);
        processedCount += batch.length;

        // Update progress
        await supabase
            .from('export_jobs')
            .update({
                processed_rows: processedCount,
            })
            .eq('id', id);

        // Wait for rate limit window before processing next batch
        if (i + batchSize < validWebsites.length) {
            console.log(`Waiting ${RATE_LIMIT_WINDOW}ms before processing next batch of personalizations`);
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_WINDOW));
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