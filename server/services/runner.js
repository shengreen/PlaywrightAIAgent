const { chromium } = require('playwright');
const { analyzeError } = require('./analyzer');

/**
 * 获取浏览器实例
 */
async function getBrowser() {
  return await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
}

/**
 * 运行单个测试
 */
async function runTest(testCase) {
  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleLogs = [];
  const errors = [];

  // 监听 console
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      });
    }
  });

  // 监听页面错误
  page.on('pageerror', error => {
    errors.push({
      message: error.message,
      timestamp: new Date().toISOString()
    });
  });

  let screenshot = null;
  let passed = false;
  let errorMessage = null;
  let errorType = null;

  try {
    // 首先导航到页面
    await page.goto(testCase.url, { waitUntil: 'networkidle', timeout: 30000 });

    // 清理脚本，只保留核心操作代码
    let scriptCode = testCase.script;

    // 移除 import 语句
    scriptCode = scriptCode.replace(/import\s+.*?from\s+['"].*?['"];?\s*/g, '');

    // 移除 require 语句
    scriptCode = scriptCode.replace(/const\s+.*?=\s*require\(['"].*?['"]\);?\s*/g, '');

    // 检查是否有 test 函数定义
    const testFunctionPatterns = [
      /test\s*\(\s*['"](.*?)['"]\s*,\s*async\s*\(\s*\{?\s*page\s*\}?\s*\)\s*=>\s*\{/,
      /test\s*\(\s*['"](.*?)['"]\s*,\s*async\s*\(\s*page\s*\)\s*=>\s*\{/,
      /it\s*\(\s*['"](.*?)['"]\s*,\s*async\s*\(\s*\{?\s*page\s*\}?\s*\)\s*=>\s*\{/,
      /it\s*\(\s*['"](.*?)['"]\s*,\s*async\s*\(\s*page\s*\)\s*=>\s*\{/
    ];

    let testFunctionMatch = null;
    for (const pattern of testFunctionPatterns) {
      const match = scriptCode.match(pattern);
      if (match) {
        testFunctionMatch = match;
        break;
      }
    }

    if (testFunctionMatch) {
      const startIndex = testFunctionMatch.index + testFunctionMatch[0].length;
      let braceCount = 1;
      let endIndex = startIndex;

      for (let i = startIndex; i < scriptCode.length; i++) {
        if (scriptCode[i] === '{') braceCount++;
        else if (scriptCode[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            endIndex = i;
            break;
          }
        }
      }

      const extractedCode = scriptCode.substring(startIndex, endIndex);
      scriptCode = extractedCode;
    }

    // 移除 page.goto
    scriptCode = scriptCode.replace(/await\s+page\.goto\([^)]+\);?\s*/g, '');

    // 在页面上下文中执行脚本
    const pageScript = `
      (async () => {
        // 简单的 expect 实现
        const expect = (actual) => ({
          toBe: (expected) => {
            if (actual !== expected) throw new Error('Expected ' + expected + ' but got ' + actual);
          },
          toContain: (expected) => {
            if (!String(actual).includes(expected)) throw new Error('Expected "' + actual + '" to contain "' + expected + '"');
          },
          toBeTruthy: () => {
            if (!actual) throw new Error('Expected truthy value but got ' + actual);
          }
        });

        // 延迟函数
        function smallDelay(ms = 500) {
          return new Promise(resolve => setTimeout(resolve, ms));
        }

        // 执行用户脚本
        ${scriptCode}
      })()
    `;

    await page.evaluate(pageScript);

    passed = true;
    screenshot = await page.screenshot({ encoding: 'base64' });

  } catch (error) {
    errorMessage = error.message;

    // 捕获失败截图
    screenshot = await page.screenshot({ encoding: 'base64' });

    // 使用 LLM 分析错误类型
    try {
      const analysis = await analyzeError(
        errorMessage,
        testCase.script,
        consoleLogs,
        errors
      );
      errorType = analysis.errorType;
    } catch (e) {
      errorType = classifyErrorByRules(errorMessage, errors);
    }

  } finally {
    await context.close();
    await browser.close();
  }

  return {
    passed,
    screenshot,
    errorMessage,
    errorType,
    consoleLogs,
    pageErrors: errors
  };
}

/**
 * 根据规则分类错误
 */
function classifyErrorByRules(errorMessage, pageErrors) {
  const msg = errorMessage.toLowerCase();
  if (msg.includes('timeout') || msg.includes('network') || msg.includes('navigation')) {
    return 'environment';
  }
  if (msg.includes('syntaxerror') || msg.includes('referenceerror') || msg.includes('typeerror')) {
    return 'script';
  }
  return 'bug';
}

/**
 * 运行所有测试
 */
async function runAllTests(testCases, onProgress = () => {}) {
  const results = [];

  for (let i = 0; i < testCases.length; i++) {
    onProgress(i, testCases.length);
    const result = await runTest(testCases[i]);
    results.push(result);
  }

  return results;
}

module.exports = {
  runTest,
  runAllTests,
  classifyErrorByRules
};
