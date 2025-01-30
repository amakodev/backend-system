// src/routes/websites.js
const express = require('express');
const router = express.Router();
const AIService = require('../services/AIService');
const FirecrawlService = require('../services/FirecrawlService');
const supabase = require('../utils/supabase');

const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW = 60000;

// Utility function to update Supabase
const updateSupabaseAndState = async (url, data) => {
    try {
        const { data: existingRecord } = await supabase
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

        //Update
        const { data: updatedRecord, error: updatedRecordError } = await supabase
        .from('personalization_cache')
        .upsert(updatedPersonalizations)
        .eq('url', url)
        .eq('user_id', userId)
        .select()
        .single();

        if (updatedRecordError) console.log('Update Error', updatedRecordError.message);

        console.log(`Updated personalizations for website ${url}, for ${userId}`, updatedRecord)
        return updatedRecord;
    } catch (err) {
        console.error('Error updating export personilizations:', err);
        return null;
    }
};

// GET /api/websites/data
router.get('/data', async (req, res) => {
    try {
        const { websites, limit } = req.query;
        const websiteList = JSON.parse(websites);

        if (!websiteList?.length) {
            return res.status(400).json({ error: 'No websites provided' });
        }

        const query = supabase
            .from('website_crawls')
            .select()
            .in('url', websiteList.slice(0, limit))
            .order('created_at', { ascending: false });

        const { data, error } = await query;

        if (error) throw error;
        res.json({ data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/websites/cache
router.get('/cache', async (req, res) => {
    try {
        const { websites } = req.query;
        const websiteList = JSON.parse(websites);

        if (!websiteList?.length) {
            return res.status(400).json({ error: 'No websites provided' });
        }

        const cachedResults = await Promise.all(
            websiteList.map(async (url) => {
                const { data: cachedData } = await supabase
                    .from('website_crawls')
                    .select('crawl_data')
                    .eq('url', url)
                    .single();
                return { url, cached: !!cachedData?.crawl_data };
            })
        );

        const cachedUrls = cachedResults
            .filter(result => result.cached)
            .map(result => result.url);

        res.json({ data: cachedUrls });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/websites/process
router.post('/process', async (req, res) => {
    try {
        const { websites, totalRows = 10, updateSummary = false } = req.body;
        
        if (!websites?.length) {
            return res.status(400).json({ error: 'No websites provided' });
        }

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
                    if (cachedData?.isLoading || !cachedData?.summary || updateSummary) {
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
            } catch (error) {
                console.logy(`Error processing website ${url}:`, error);
                if (error.message?.includes('Rate limit exceeded')) {
                    const resetTimeMatch = error.message.match(/retry after (\d+)s/);
                    if (resetTimeMatch) {
                        const resetSeconds = parseInt(resetTimeMatch[1]) + 1;
                        await new Promise(resolve => setTimeout(resolve, resetSeconds * 1000));
                        queue.push(url);
                        continue;
                    }
                }
                console.log(`Failed to process ${url}`);
            }
        }

        res.json({ data: results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/websites/personalization
router.post('/generate-personalizations', async (req, res) => {
    try {
        const { userId, websiteData, type, prompt } = req.body;

        const processingPromises = websiteData.map(async (site) => {
            if (!(site?.crawl_data) || !(site?.url)) return;

            try {
                const result = await AIService.analyzeWebsite(site.crawl_data, type, prompt);
                await updateExportPersonalizations(userId, site.url, {
                    [type]: result
                });
                return { url: site.url, success: true };
            } catch (error) {
                console.error(`Error generating ${type} for ${site.url}:`, error);
                return { url: site.url, success: false, error: error.message };
            }
        });

        const results = await Promise.all(processingPromises);
        res.json({ data: results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/websites/process-personalizations
router.post('/process-personalizations', async (req, res) => {
    try {
        const { initData, websiteData } = req.body;
        const { id, selected_templates, user_id } = initData || {};

        if (!id || !selected_templates) {
            throw new Error("Invalid ExportJob parameters to process personalizations");
        }

        const validWebsites = websiteData.filter(site => site?.crawl_data && site?.url);
        const results = [];

        for (const site of validWebsites) {
            try {
                if (selected_templates?.length > 0) {
                    const templateResults = [];
                    for (const type of selected_templates) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                        const personalization = await AIService.analyzeWebsite(site.crawl_data, type);
                        templateResults.push({ type, personalization });
                    }

                    const exportTemplates = templateResults.reduce((acc, { type, personalization }) => ({
                        ...acc,
                        [type]: personalization
                    }), {});

                    await updateExportPersonalizations(user_id, site.url, exportTemplates);
                    results.push({ url: site.url, success: true });
                }
            } catch (error) {
                console.error(`Error generating personalizations for ${site.url}:`, error);
                results.push({ url: site.url, success: false, error: error.message });
            }
        }

        res.json({ data: results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;