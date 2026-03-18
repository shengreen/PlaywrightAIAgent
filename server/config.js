require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  minimax: {
    apiKey: process.env.MINIMAX_API_KEY || '',
    baseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimax.chat/v1',
    model: process.env.MINIMAX_MODEL || 'abab6.5s-chat'
  },
  crawl: {
    cacheTTL: process.env.REDIS_TTL_MS || 60 * 60 * 1000, // 从环境变量读取，默认1小时
    timeout: 30000
  },
  test: {
    timeout: 60000,
    maxRetries: 2
  }
};
