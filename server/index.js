const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const db = require('./db');

// 导入路由
const projectRoutes = require('./routes/projects');
const crawlRoutes = require('./routes/crawl');
const generateRoutes = require('./routes/generate');
const testRoutes = require('./routes/test');
const reportRoutes = require('./routes/reports');

const app = express();

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 提供静态文件 (demo-shop 等)
app.use(express.static(path.join(__dirname, '..', 'demo-shop')));

// 路由
app.use('/api/projects', projectRoutes);
app.use('/api/crawl', crawlRoutes);
app.use('/api/generate', generateRoutes);
app.use('/api/test', testRoutes);
app.use('/api/reports', reportRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: err.message || 'Internal Server Error',
    stack: config.nodeEnv === 'development' ? err.stack : undefined
  });
});

const PORT = config.port;

// 启动服务器
async function start() {
  try {
    // 初始化数据库
    await db.loadDB();
    console.log('Database initialized');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${config.nodeEnv}`);
      if (!config.minimax.apiKey) {
        console.warn('Warning: MINIMAX_API_KEY not configured');
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

module.exports = app;
