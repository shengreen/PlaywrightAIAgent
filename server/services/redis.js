const Redis = require('ioredis');
const crypto = require('crypto');

// Redis 配置
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true
};

let redis = null;

// 获取 Redis 实例
function getRedis() {
  if (!redis) {
    redis = new Redis(redisConfig);

    redis.on('error', (err) => {
      console.error('Redis 连接错误:', err.message);
    });

    redis.on('connect', () => {
      console.log('Redis 已连接');
    });
  }
  return redis;
}

/**
 * 生成 accessibility tree 的指纹
 * @param {Object} tree - accessibility tree
 * @returns {string} hash 字符串
 */
function generateTreeHash(tree) {
  if (!tree) return '';

  // 将 tree 转为字符串，只保留关键字段
  const keyData = JSON.stringify({
    role: tree.role,
    name: tree.name,
    children: tree.children?.map(c => ({
      role: c.role,
      name: c.name?.substring(0, 30),
      children: c.children?.slice(0, 3).map(cc => ({ role: cc.role, name: cc.name?.substring(0, 20) }))
    })).slice(0, 20)
  });

  return crypto.createHash('md5').update(keyData).digest('hex').substring(0, 12);
}

// 页面爬取缓存
const crawlCache = {
  /**
   * 获取缓存并对比 tree hash
   * @param {string} url - 网页URL
   * @param {Object} currentTree - 当前爬取的 accessibility tree
   * @returns {Object|null} { data, isHit: boolean }
   */
  async check(url, currentTree) {
    try {
      const client = getRedis();
      const key = `crawl:${Buffer.from(url).toString('base64').substring(0, 50)}`;
      const cached = await client.get(key);

      if (!cached) {
        return { data: null, isHit: false };
      }

      const cachedData = JSON.parse(cached);
      const cachedHash = cachedData.treeHash;
      const currentHash = generateTreeHash(currentTree);

      // 对比 hash，一致才算命中
      if (cachedHash === currentHash) {
        return {
          data: {
            ...cachedData.crawlData,
            cached: true,
            cachedAt: cachedData.cachedAt
          },
          isHit: true
        };
      }

      // tree 变化了，缓存失效
      return { data: null, isHit: false, newHash: currentHash };
    } catch (err) {
      console.error('Redis check 错误:', err.message);
      return { data: null, isHit: false };
    }
  },

  /**
   * 设置缓存
   * @param {string} url - 网页URL
   * @param {Object} crawlData - 爬取数据
   * @param {string} treeHash - tree 指纹
   * @param {number} ttl - 过期时间（秒），默认 1 小时
   */
  async set(url, crawlData, treeHash, ttl = 3600) {
    try {
      const client = getRedis();
      const key = `crawl:${Buffer.from(url).toString('base64').substring(0, 50)}`;

      const cacheData = {
        treeHash,
        crawlData,
        cachedAt: new Date().toISOString()
      };

      await client.setex(key, ttl, JSON.stringify(cacheData));
      return cacheData;
    } catch (err) {
      console.error('Redis set 错误:', err.message);
    }
  },

  /**
   * 清除指定 URL 缓存
   * @param {string} url - 网页URL
   */
  async delete(url) {
    try {
      const client = getRedis();
      const key = `crawl:${Buffer.from(url).toString('base64').substring(0, 50)}`;
      await client.del(key);
    } catch (err) {
      console.error('Redis delete 错误:', err.message);
    }
  },

  /**
   * 清除所有爬取缓存
   */
  async clear() {
    try {
      const client = getRedis();
      const keys = await client.keys('crawl:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } catch (err) {
      console.error('Redis clear 错误:', err.message);
    }
  },

  /**
   * 获取缓存统计
   */
  async getStats() {
    try {
      const client = getRedis();
      const keys = await client.keys('crawl:*');
      return { count: keys.length };
    } catch (err) {
      return { count: 0, error: err.message };
    }
  }
};

// LLM 响应缓存
const llmCache = {
  /**
   * 生成 LLM 请求的缓存 key
   * @param {string} systemPrompt - 系统提示
   * @param {string} userPrompt - 用户提示
   * @param {Object} options - 选项
   * @returns {string} hash key
   */
  generateKey(systemPrompt, userPrompt, options = {}) {
    const { temperature = 0.7, maxTokens = 4000, model } = options;
    const keyData = JSON.stringify({ systemPrompt, userPrompt, temperature, maxTokens, model });
    return `llm:${crypto.createHash('md5').update(keyData).digest('hex').substring(0, 16)}`;
  },

  /**
   * 获取 LLM 缓存
   * @param {string} key - 缓存 key
   * @returns {Object|null} 缓存结果
   */
  async get(key) {
    try {
      const client = getRedis();
      const cached = await client.get(key);
      if (cached) {
        const data = JSON.parse(cached);
        console.log(`[LLM缓存命中] ${key}`);
        return { ...data, cached: true };
      }
      return null;
    } catch (err) {
      console.error('LLM Redis get 错误:', err.message);
      return null;
    }
  },

  /**
   * 设置 LLM 缓存
   * @param {string} key - 缓存 key
   * @param {Object} data - LLM 响应数据
   * @param {number} ttl - 过期时间（秒），默认 24 小时
   */
  async set(key, data, ttl = 86400) {
    try {
      const client = getRedis();
      await client.setex(key, ttl, JSON.stringify(data));
    } catch (err) {
      console.error('LLM Redis set 错误:', err.message);
    }
  },

  /**
   * 清除所有 LLM 缓存
   */
  async clear() {
    try {
      const client = getRedis();
      const keys = await client.keys('llm:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } catch (err) {
      console.error('LLM Redis clear 错误:', err.message);
    }
  },

  /**
   * 获取 LLM 缓存统计
   */
  async getStats() {
    try {
      const client = getRedis();
      const keys = await client.keys('llm:*');
      return { count: keys.length };
    } catch (err) {
      return { count: 0, error: err.message };
    }
  }
};

module.exports = {
  getRedis,
  crawlCache,
  llmCache,
  generateTreeHash
};
