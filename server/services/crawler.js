const { chromium } = require('playwright');
const db = require('../db');
const config = require('../config');

let browser = null;

async function getBrowser() {
  if (!browser) {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (err) {
      console.error('Failed to launch browser:', err.message);
      throw new Error('Browser launch failed: ' + err.message);
    }
  }
  return browser;
}

/**
 * 抓取网页的 accessibility tree
 * @param {string} url - 网页URL
 * @param {Object} options - 抓取选项
 * @param {string} options.preScript - 预处理脚本（用于登录等）
 * @param {number} options.waitFor - 等待时间（毫秒）
 * @param {string} options.waitForSelector - 等待特定选择器
 * @returns {Object} 抓取结果
 */
async function crawlAccessibilityTree(url, options = {}) {
  const { preScript, waitFor = 3000, waitForSelector } = options;

  // 检查缓存
  const cached = await db.crawlCache.get(url);

  if (cached) {
    return {
      ...cached,
      cached: true,
      accessibilityTree: cached.accessibilityTree,
      consoleLogs: cached.consoleLogs || [],
      pageInfo: cached.pageInfo || { title: cached.url, url: cached.url, finalUrl: cached.url }
    };
  }

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });

  const page = await context.newPage();

  const consoleLogs = [];
  const errors = [];

  // 监听 console
  page.on('console', msg => {
    consoleLogs.push({
      type: msg.type(),
      text: msg.text(),
      timestamp: new Date().toISOString()
    });
  });

  // 监听页面错误
  page.on('pageerror', error => {
    errors.push({
      message: error.message,
      timestamp: new Date().toISOString()
    });
  });

  try {
    // 导航到页面
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: config.crawl.timeout
    });

    // 执行预处理脚本（如果有）
    if (preScript) {
      await page.evaluate((script) => {
        // 使用 Function 构造函数执行用户脚本
        new Function(script)();
      }, preScript);
    }

    // 等待指定时间
    if (waitFor > 0) {
      await page.waitForTimeout(waitFor);
    }

    // 等待特定选择器（如果有）
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 10000 }).catch(() => {});
    }

    // 获取 accessibility tree - 使用 DOM 元素提取方式
    let accessibilityTree = null;
    try {
      accessibilityTree = await page.evaluate(() => {
        const getAccessibleName = (el) => {
          if (el.alt) return el.alt.trim();
          if (el.textContent) return el.textContent.trim().substring(0, 100);
          if (el.placeholder) return el.placeholder.trim();
          if (el.value) return String(el.value).trim();
          return '';
        };

        const getRole = (el) => {
          if (el.tagName === 'BUTTON') return 'button';
          if (el.tagName === 'A') return 'link';
          if (el.tagName === 'INPUT') return el.type === 'checkbox' ? 'checkbox' : el.type === 'radio' ? 'radio' : 'textbox';
          if (el.tagName === 'SELECT') return 'combobox';
          if (el.tagName === 'TEXTAREA') return 'textbox';
          if (el.tagName === 'H1') return 'heading';
          if (el.tagName === 'H2') return 'heading';
          if (el.tagName === 'H3') return 'heading';
          if (el.tagName === 'P') return 'paragraph';
          if (el.tagName === 'LABEL') return 'label';
          if (el.role) return el.role;
          return 'generic';
        };

        // 收集所有重要元素
        const selectors = 'button, a, input, select, textarea, h1, h2, h3, h4, h5, h6, p, label, form, ul, ol, li, div[role="button"], div[role="link"]';
        const elements = Array.from(document.querySelectorAll(selectors))
          .slice(0, 100)
          .map(el => {
            const role = getRole(el);
            const name = getAccessibleName(el);
            if (!name && role !== 'heading') return null;
            return {
              role,
              name: name || role,
              id: el.id || undefined,
              className: el.className?.trim() || undefined,
              href: el.href || undefined,
              type: el.type || undefined,
              checked: el.checked || undefined,
              value: el.value || undefined
            };
          })
          .filter(Boolean);

        // 构建树形结构
        const root = {
          role: 'RootWebArea',
          name: document.title || 'Page',
          children: []
        };

        // 按 DOM 层级组织
        const headings = elements.filter(e => e.role === 'heading');
        const buttons = elements.filter(e => e.role === 'button');
        const links = elements.filter(e => e.role === 'link');
        const inputs = elements.filter(e => e.role === 'textbox' || e.role === 'checkbox' || e.role === 'radio' || e.role === 'combobox');
        const others = elements.filter(e => !['heading', 'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox'].includes(e.role));

        if (headings.length > 0) root.children.push({ role: 'group', name: 'Headings', children: headings.slice(0, 5) });
        if (buttons.length > 0) root.children.push({ role: 'group', name: 'Buttons', children: buttons.slice(0, 10) });
        if (links.length > 0) root.children.push({ role: 'group', name: 'Links', children: links.slice(0, 10) });
        if (inputs.length > 0) root.children.push({ role: 'group', name: 'Inputs', children: inputs.slice(0, 15) });
        if (others.length > 0) root.children.push({ role: 'group', name: 'Others', children: others.slice(0, 10) });

        return root;
      });
    } catch (evalErr) {
      console.error('Failed to extract DOM elements:', evalErr.message);
      accessibilityTree = {
        role: 'RootWebArea',
        name: 'Page',
        children: []
      };
    }

    // 获取截图
    const screenshot = await page.screenshot({ encoding: 'base64' });

    // 获取页面标题和URL
    const pageInfo = {
      title: await page.title(),
      url: page.url(),
      finalUrl: page.url()
    };

    const result = {
      url,
      accessibilityTree,
      screenshot,
      consoleLogs,
      errors,
      pageInfo,
      cached: false,
      crawledAt: new Date().toISOString()
    };

    // 缓存结果
    await db.crawlCache.set(url, accessibilityTree, screenshot, consoleLogs, pageInfo);

    return result;

  } finally {
    await context.close();
  }
}

/**
 * 简化 accessibility tree 以减少 token 使用
 * @param {Object} tree - 完整的 accessibility tree
 * @param {number} maxDepth - 最大深度
 * @returns {Object} 简化后的 tree
 */
function simplifyAccessibilityTree(tree, maxDepth = 5) {
  if (!tree) return null;

  function simplify(node, depth = 0) {
    if (depth > maxDepth || !node) return null;

    const simplified = {
      role: node.role,
      name: node.name?.substring(0, 100), // 限制name长度
    };

    if (node.children && node.children.length > 0) {
      // 限制子节点数量
      const maxChildren = depth < 2 ? 20 : 5;
      simplified.children = node.children
        .slice(0, maxChildren)
        .map(child => simplify(child, depth + 1))
        .filter(Boolean);
    }

    return simplified;
  }

  return simplify(tree);
}

/**
 * 获取 accessibility tree 的摘要描述
 * @param {Object} tree - accessibility tree
 * @returns {string} 摘要描述
 */
function getAccessibilitySummary(tree) {
  if (!tree) return 'No accessibility tree available';

  const elements = [];

  function traverse(node, depth = 0) {
    if (depth > 4 || !node) return;

    if (node.role && node.name) {
      elements.push(`${node.role}: "${node.name.substring(0, 50)}"`);
    }

    if (node.children) {
      node.children.forEach(child => traverse(child, depth + 1));
    }
  }

  traverse(tree);

  return elements.slice(0, 50).join('\n');
}

module.exports = {
  crawlAccessibilityTree,
  simplifyAccessibilityTree,
  getAccessibilitySummary,
  getBrowser
};
