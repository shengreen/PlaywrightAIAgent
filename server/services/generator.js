const { callLLM, parseJSON } = require('./llm');
const { simplifyAccessibilityTree, getAccessibilitySummary } = require('./crawler');
const fs = require('fs');
const path = require('path');

// 加载 prompt 文件
const PROMPTS_DIR = path.join(__dirname, '../prompts');

function loadPrompt(name) {
  try {
    return fs.readFileSync(path.join(PROMPTS_DIR, `${name}.md`), 'utf-8');
  } catch (e) {
    console.error(`Failed to load prompt ${name}:`, e.message);
    return '';
  }
}

const PROMPTS = {
  generator: loadPrompt('generator'),
  testcase: loadPrompt('testcase')
};

/**
 * 生成测试用例
 * @param {Object} crawlResult - 抓取结果
 * @param {string} instruction - 用户指令
 * @returns {Array} 测试用例数组
 */
async function generateTestCases(crawlResult, instruction = '') {
  const { accessibilityTree, pageInfo, consoleLogs } = crawlResult;

  const simplifiedTree = simplifyAccessibilityTree(accessibilityTree, 4);
  const treeSummary = getAccessibilitySummary(accessibilityTree);

  const systemPrompt = PROMPTS.testcase || `你是一个专业的QA工程师，擅长分析网页并生成测试用例。

## 输出格式
请返回JSON数组，每个元素包含：
- description: 测试描述
- type: 测试类型 (functionality|ui|navigation|form|api)
- targetElement: 要测试的元素（基于accessibility tree）
- assertions: 预期结果数组

## 注意事项
- 使用元素的accessibility role和name来定位元素
- 优先测试核心功能
- 考虑边界情况和错误处理`;

  const userPrompt = `## 页面信息
- URL: ${pageInfo.url}
- 标题: ${pageInfo.title}

## 用户指令
${instruction || '生成全面的功能测试用例'}

## Accessibility Tree 摘要
${treeSummary}

请生成5-10个测试用例，覆盖页面主要功能。`;

  const llmResponse = await callLLM(systemPrompt, userPrompt);

  // Handle both old string format and new object format
  const content = typeof llmResponse === 'string' ? llmResponse : llmResponse.content;
  const usage = typeof llmResponse === 'object' ? llmResponse.usage : null;

  try {
    const testCases = parseJSON(content);
    return {
      testCases: Array.isArray(testCases) ? testCases : [testCases],
      usage
    };
  } catch (error) {
    console.error('Failed to parse test cases:', error);
    // 返回默认测试用例
    return {
      testCases: [{
        description: '页面加载成功',
        type: 'functionality',
        targetElement: 'document',
        assertions: ['页面应正常加载']
      }],
      usage
    };
  }
}

/**
 * 生成 Playwright 脚本
 * @param {Object} testCase - 测试用例
 * @param {Object} crawlResult - 抓取结果
 * @returns {string} Playwright 脚本
 */
async function generatePlaywrightScript(testCase, crawlResult) {
  const { accessibilityTree, pageInfo } = crawlResult;
  const simplifiedTree = simplifyAccessibilityTree(accessibilityTree, 3);

  const systemPrompt = PROMPTS.generator || `你是一个Web自动化测试专家。基于页面的Accessibility Tree生成稳定可靠的自动化测试代码。

## 核心原则
1. **必须基于Accessibility Tree中的信息来定位元素**
2. Accessibility Tree中的每个元素都有：role（角色）、name（名称）、value等属性
3. 优先使用元素的文本内容、label、placeholder来定位，而不是CSS选择器

## 定位策略（按优先级）
1. **通过链接文本**: Array.from(document.querySelectorAll('a')).find(a => a.textContent.includes('登录'))
2. **通过按钮文本**: Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('提交'))
3. **通过输入框label**: Array.from(document.querySelectorAll('input,textarea')).find(i => i.labels?.()?.some(l => l.textContent.includes('用户名')))
4. **通过role和name**: document.querySelector('[role="button"][name="确认"]')
5. **最后才用placeholder**: document.querySelector('input[placeholder="请输入"]')

## 操作示例
\`\`\`javascript
// 找到登录按钮并点击
const loginBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('登录') || b.getAttribute('type') === 'submit');
if (loginBtn) loginBtn.click();

// 找到用户名输入框并输入
const usernameInput = Array.from(document.querySelectorAll('input')).find(i =>
  i.labels?.()?.some(l => l.textContent.includes('用户名')) ||
  i.placeholder?.includes('用户名') ||
  i.name === 'username'
);
if (usernameInput) {
  usernameInput.value = 'testuser';
  usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
}
\`\`\`

## 重要提醒
- 不要硬编码CSS选择器如 #id 或 .class
- 不要使用 XPath
- 充分利用 Accessibility Tree 中的 role、name、label 信息
- 每个操作后用 smallDelay() 等待`;

  const userPrompt = `## 测试用例
${JSON.stringify(testCase, null, 2)}

## 目标页面 URL
${pageInfo.url}

## Accessibility Tree（包含所有可交互元素）
${JSON.stringify(simplifiedTree, null, 2)}

请生成基于上述Accessibility Tree的JavaScript测试代码。代码应该能直接在浏览器控制台执行。`;

  const response = await callLLM(systemPrompt, userPrompt);

  // Extract usage info if available
  const usage = typeof response === 'object' ? response.usage : null;
  const content = typeof response === 'string' ? response : response.content;

  // 提取代码块
  const codeMatch = content.match(/```(?:javascript|typescript)?\n([\s\S]*?)\n```/);

  if (codeMatch) {
    return { script: codeMatch[1].trim(), usage };
  }

  // 如果没有代码块，返回整个响应
  return { script: content, usage };
}

/**
 * 批量生成测试用例和脚本
 * @param {string} url - 测试URL
 * @param {Object} crawlResult - 抓取结果
 * @param {string} instruction - 用户指令
 * @returns {Array} 完整测试数据
 */
async function generateTests(url, crawlResult, instruction = '') {
  const result = await generateTestCases(crawlResult, instruction);
  const testCasesList = result.testCases;
  const usage = result.usage;

  const tests = [];

  for (const testCase of testCasesList) {
    const scriptResult = await generatePlaywrightScript(testCase, crawlResult);
    const script = typeof scriptResult === 'string' ? scriptResult : scriptResult.script;
    const scriptUsage = typeof scriptResult === 'object' ? scriptResult.usage : null;

    tests.push({
      url,
      description: testCase.description,
      type: testCase.type,
      script,
      status: 'pending'
    });
  }

  return { tests, usage };
}

module.exports = {
  generateTestCases,
  generatePlaywrightScript,
  generateTests
};
