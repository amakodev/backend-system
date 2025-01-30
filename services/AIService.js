class AIService {
  static API_KEY = process.env.OPEN_API_KEY;

  static prompts = {
    "intro": `Using the following text data from {business_name}'s website, read their copy. Check if they have any blogs, unique phrases, or unique strategies. The goal is for you to find something that would show that you've paid attention to their business in order to create a hyper-personalized opening to a cold email. Make the tone of the sentence friendly, conversational, spartan, and non-corporate. Make it a very brief compliment and only one sentence using an "I" statement, ending with an exclamation point, without using words above a high school reading level. Do not include any quotations or anything else besides the compliment whatsoever.

        Use this beginning and finish the rest:
        "I was checking out {business_name}'s website and..."

        Some great examples would be:
        "I really loved reading your blog about transparency in the industry, something that's a crucial issue I've been hearing about"
        "I love that you guys are using InteroBOT to scan for competition for you clients, super smart idea!"
        "I saw you guys had that accessibility webinar coming up-- thanks for covering such an important topic!"

        Do not just repeat what their service does. Pinpoint something and make it personal.

        Check to see if you can mention any of these in your response. Only mention it if it actually exists:
        1. A recent event coming up that is showed on their website
        2. A unique strategy they mention using in their business, such as a bot or framework
        3. An award they have on their business
        4. A case study showing off an impressive statistic.

        Do not make it more than 25 words. If you are unable to find anything relevant or do not have enough information, respond with "Unable", and then why you are not able to provide an output.

        Remember, do NOT include any quotation marks or anything else under ANY circumstance.

        Website Content: {content}

        Output:`,
    "ps": `Using the following text data from {business_name}'s website, read their copy. Check if they have any blogs, unique phrases, or unique strategies. The goal is for you to find something that would show that you've paid attention to their business in order to create a hyper-personalized opening to a cold email. Make the tone of the sentence friendly but quick. Make it a very brief compliment and only one sentence, without using words above a high school reading level. Do not include any quotations or anything else besides the compliment whatsoever.

        Use this beginning and finish the rest:
        "PS, Love..."

        Some great examples would be:
        "that you guys have that blog on accessibility-- great stuff."
        "that you're using InteroBOT for your clients-- smart move."
        "that case study you guys have with Microsoft."

        Do not just repeat what their service does. Pinpoint something and make it personal.

        Check to see if you can mention any of these in your response. Only mention it if it actually exists:
        1. A recent event coming up that is showed on their website
        2. A unique strategy they mention using in their business, such as a bot or framework
        3. An award they have on their business
        4. A case study showing off an impressive statistic.

        Do not make it more than 15 words. If you are unable to find anything relevant or do not have enough information, respond with "Unable", and then why you are not able to provide an output.

        Remember, do NOT include any quotation marks or anything else under ANY circumstance.

        Website Content: {content}

        Output:`,
    "summary": `Please give a less than 30 word summary of what this website is about.

        Website Content: {content}

        Output:`,
  };

  static getApiKey() {
    return this.API_KEY;
  }

  static async analyzeWebsite(data, promptType, customPrompt) {
    try {
      console.log('Making request to OpenAI API with prompt type:', promptType);
      console.log('Data being sent to OpenAI:', data);
      console.log('Custom prompt if any:', customPrompt);
      
      let selectedPrompt;
      if (promptType.startsWith('custom_')) {
        // For custom prompts, use the custom prompt directly with the website data
        selectedPrompt = `${customPrompt}\n\nWebsite content: ${JSON.stringify(data)}`;
      } else {
        // For standard prompts, use the template system
        const template = this.prompts[promptType];
        if (!template) {
          throw new Error(`Unknown prompt type: ${promptType}`);
        }
        
        selectedPrompt = template
          .replace('{content}', JSON.stringify(data))
          .replace(/{business_name}/g, data.business_name || '');
      }
      
      console.log('Final prompt being sent to OpenAI:', selectedPrompt);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a helpful assistant that analyzes website content.' },
            { role: 'user', content: selectedPrompt }
          ],
          temperature: 0.7,
          max_tokens: 200
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('OpenAI API Error:', errorData);
        throw new Error(errorData.error?.message || 'Failed to get AI analysis');
      }

      const result = await response.json();
      console.log('OpenAI API Success:', result);
      return result.choices[0].message.content;
    } catch (error) {
      console.error('Error during AI analysis:', error);
      throw error;
    }
  }
}

module.exports = AIService;