const express = require('express');
const { crawlAccessibilityTree, simplifyAccessibilityTree, getAccessibilitySummary } = require('../services/crawler');

const router = express.Router();

// 抓取 URL 的 accessibility tree
router.post('/', async (req, res) => {
  try {
    const { url, preScript, waitFor, waitForSelector } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'url is required' });
    }

    // 验证 URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const result = await crawlAccessibilityTree(url, {
      preScript,
      waitFor: waitFor || 3000,
      waitForSelector
    });

    // 返回简化版（减少数据量）
    // 将 Buffer 转换为 base64 字符串
    const screenshotBase64 = result.screenshot ? Buffer.from(result.screenshot).toString('base64') : null;
    res.json({
      url: result.url,
      pageInfo: result.pageInfo,
      simplifiedTree: simplifyAccessibilityTree(result.accessibilityTree, 4),
      treeSummary: getAccessibilitySummary(result.accessibilityTree),
      screenshot: screenshotBase64,
      consoleErrors: result.consoleLogs.filter(l => l.type === 'error'),
      cached: result.cached,
      crawledAt: result.crawledAt
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取截图
router.post('/screenshot', async (req, res) => {
  try {
    const { url, preScript, waitFor, waitForSelector } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'url is required' });
    }

    const result = await crawlAccessibilityTree(url, {
      preScript,
      waitFor: waitFor || 3000,
      waitForSelector
    });

    // 将 Buffer 转换为 base64 字符串
    const screenshotBase64 = result.screenshot ? Buffer.from(result.screenshot).toString('base64') : null;
    res.json({
      url: result.url,
      screenshot: screenshotBase64,
      crawledAt: result.crawledAt
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
