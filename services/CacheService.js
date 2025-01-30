import supabase from "../utils/supabase";

export class CacheService {
  static async checkCache(url) {
    console.log('Checking cache for URL:', url);
    
    const { data: cachedData, error } = await supabase
      .from('website_crawls')
      .select('crawl_data, word_count')
      .eq('url', url)
      .maybeSingle();

    if (error) {
      console.error('Error checking cache:', error);
      return null;
    }

    if (cachedData) {
      console.log('Cache hit for URL:', url);
      return {
        data: cachedData.crawl_data,
        wordCount: cachedData.word_count
      };
    }

    console.log('Cache miss for URL:', url);
    return null;
  }

  static async saveToCache(url, crawlData, wordCount) {
    console.log('Saving to cache:', url);
    
    const { error } = await supabase
      .from('website_crawls')
      .update({
        crawl_data: crawlData,
        word_count: wordCount,
        updated_at: new Date().toISOString(),
        isLoading: false
      }).eq('url', url);

    if (error) {
      console.error('Error saving to cache:', error);
    } else {
      console.log('Successfully saved to cache');
    }
  }

  static calculateWordCount(data) {
    const text = JSON.stringify(data);
    return text.split(/\s+/).length;
  }
}

module.exports = new ExportService();