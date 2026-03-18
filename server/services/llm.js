const axios = require('axios');
const config = require('../config');
const { llmCache } = require('./redis');

/**
 * 调用 Minimax LLM API
 * @param {string} systemPrompt - 系统提示
 * @param {string} userPrompt - 用户提示
 * @param {Object} options - 选项
 * @param {string} options.url - 网页URL（用于缓存）
 * @param {string} options.treeHash - accessibility tree hash（用于缓存）
 * @returns {Object} { content, usage, cached } LLM 回复和使用量
 */
async function callLLM(systemPrompt, userPrompt, options = {}) {
  const { temperature = 0.7, maxTokens = 4000, useCache = true, url, treeHash } = options;

  if (!config.minimax.apiKey) {
    throw new Error('MINIMAX_API_KEY not configured');
  }

  // 生成缓存 key：URL + treeHash + prompt 全部包含才命中
  const cacheKey = llmCache.generateKey(systemPrompt, userPrompt, {
    ...options,
    model: config.minimax.model,
    url: url || 'none',
    treeHash: treeHash || 'none'
  });

  // 尝试从缓存获取
  if (useCache && url && treeHash) {
    const cachedResult = await llmCache.get(cacheKey);
    if (cachedResult) {
      console.log(`[LLM缓存命中] ${url.substring(0, 30)}... (treeHash: ${treeHash})`);
      return {
        content: cachedResult.content,
        usage: cachedResult.usage,
        cached: true
      };
    }
  }

  try {
    const response = await axios.post(
      `${config.minimax.baseUrl}/text/chatcompletion_v2`,
      {
        model: config.minimax.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature,
        max_tokens: maxTokens
      },
      {
        headers: {
          'Authorization': `Bearer ${config.minimax.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    // Extract usage info if available
    const usage = response.data?.usage || null;

    if (response.data?.choices?.[0]?.message?.content) {
      const result = {
        content: response.data.choices[0].message.content,
        usage,
        cached: false
      };

      // 缓存结果（24小时过期）- 只有提供 URL 和 treeHash 才缓存
      if (useCache && url && treeHash) {
        const ttlSeconds = Math.floor((config.crawl.cacheTTL || 3600000) / 1000) * 24;
        await llmCache.set(cacheKey, result, ttlSeconds);
        console.log(`[LLM缓存设置] ${url.substring(0, 30)}... (treeHash: ${treeHash})`);
      }

      return result;
    }

    throw new Error('Invalid response from LLM');

  } catch (error) {
    if (error.response?.data?.base_resp?.status_msg) {
      throw new Error(`LLM Error: ${error.response.data.base_resp.status_msg}`);
    }
    throw error;
  }
}

/**
 * 解析 JSON 从 LLM 响应中
 * @param {string} content - LLM 回复内容
 * @returns {Object} 解析后的 JSON
 */
function parseJSON(content) {
  // 尝试提取 JSON 块
  const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) ||
                    content.match(/```\n([\s\S]*?)\n```/) ||
                    content.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1] || jsonMatch[0]);
    } catch (e) {
      // 继续尝试
    }
  }

  // 尝试直接解析
  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error('Failed to parse JSON from LLM response');
  }
}

module.exports = {
  callLLM,
  parseJSON
};
