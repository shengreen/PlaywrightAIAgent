const { callLLM } = require('./llm');

/**
 * 分析测试错误，确定错误类型
 * @param {string} errorMessage - Playwright 错误信息
 * @param {string} script - 测试脚本
 * @param {Array} consoleLogs - Console 日志
 * @param {Array} pageErrors - 页面错误
 * @returns {Object} 分析结果
 */
async function analyzeError(errorMessage, script, consoleLogs = [], pageErrors = []) {
  const systemPrompt = `你是一个专业的自动化测试工程师，擅长分析测试失败原因。

## 错误分类
- environment: 环境问题（网络超时、页面无法访问、服务器错误）
- script: 脚本错误（语法错误、选择器错误、代码逻辑错误）
- bug: 真实的功能Bug（断言失败、功能异常）

## 分析规则
1. 网络超时、导航失败 → environment
2. 语法错误、ReferenceError、TypeError关于代码 → script
3. 元素找不到（选择器问题）→ script
4. 断言失败（如 expect 失败）→ bug
5. 页面JS错误 → environment
6. 功能不正确（如点击后没有正确反应）→ bug

## 输出格式
返回JSON：
{
  "errorType": "environment|script|bug",
  "reason": "简要说明判断原因",
  "suggestion": "建议的处理方式"
}`;

  const userPrompt = `## 错误信息
${errorMessage}

## 测试脚本
${script.substring(0, 2000)}

## Console 错误
${consoleLogs.map(l => l.text).join('\n')}

## 页面错误
${pageErrors.map(e => e.message).join('\n')}

请分析这个错误属于哪种类型。`;

  const response = await callLLM(systemPrompt, userPrompt, {
    temperature: 0.3,
    maxTokens: 500
  });

  try {
    // 尝试解析 JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    // 解析失败，使用规则判断
  }

  // 如果解析失败，尝试从文本中提取
  const lowerResponse = response.toLowerCase();

  if (lowerResponse.includes('"environment"') || lowerResponse.includes('environment:')) {
    return { errorType: 'environment', reason: 'LLM判定为环境问题', suggestion: '重试或检查网络' };
  }

  if (lowerResponse.includes('"script"') || lowerResponse.includes('script:')) {
    return { errorType: 'script', reason: 'LLM判定为脚本错误', suggestion: '修复脚本' };
  }

  return { errorType: 'bug', reason: 'LLM判定为功能Bug', suggestion: '报告给开发' };
}

/**
 * 生成测试报告
 * @param {Object} testResults - 测试结果
 * @param {string} projectId - 项目ID
 * @returns {Object} 报告数据
 */
function generateReport(testResults, projectId) {
  const { total, passed, failed, environmentErrors, scriptErrors, bugs, results } = testResults;

  const report = {
    id: require('uuid').v4(),
    projectId,
    summary: {
      total,
      passed,
      failed,
      environmentErrors,
      scriptErrors,
      bugs,
      passRate: total > 0 ? Math.round((passed / total) * 100) : 0
    },
    testResults: results.map(r => ({
      description: r.description,
      passed: r.passed,
      errorType: r.errorType,
      errorMessage: r.errorMessage,
      suggestions: r.suggestion
    })),
    generatedAt: new Date().toISOString()
  };

  return report;
}

/**
 * 分析整体测试结果，提供 AI 建议
 * @param {Array} results - 测试结果数组
 * @param {string} url - 测试的 URL
 * @returns {Object} 分析结果
 */
async function analyzeTestResults(results, url) {
  const systemPrompt = `你是一个专业的自动化测试工程师，擅长分析测试结果并提供改进建议。

## 你的任务
分析测试执行结果，提供：
1. 整体健康状况评估
2. 主要问题总结
3. 具体的改进建议
4. 下一步行动建议

## 输出格式
返回JSON：
{
  "overallStatus": "healthy|warning|critical",
  "summary": "总体评估摘要",
  "keyIssues": ["问题1", "问题2", ...],
  "recommendations": ["建议1", "建议2", ...],
  "nextSteps": ["下一步1", "下一步2", ...]
}`;

  const resultsSummary = results.map(r => {
    return `Test: ${r.description}
Status: ${r.passed ? 'PASSED' : 'FAILED'}
Error Type: ${r.errorType || 'none'}
${r.errorMessage ? 'Error: ' + r.errorMessage.substring(0, 500) : ''}
${r.suggestion ? 'Suggestion: ' + r.suggestion : ''}`;
  }).join('\n\n---\n\n');

  const userPrompt = `## 测试 URL
${url}

## 测试结果
${resultsSummary}

请分析这些测试结果并提供建议。`;

  const llmResponse = await callLLM(systemPrompt, userPrompt, {
    temperature: 0.5,
    maxTokens: 1000
  });

  const response = llmResponse.content;
  const usage = llmResponse.usage;

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return { ...JSON.parse(jsonMatch[0]), usage };
    }
  } catch (e) {
    // 解析失败，返回原始响应
  }

  return {
    overallStatus: 'unknown',
    summary: response.substring(0, 500),
    keyIssues: [],
    recommendations: [],
    nextSteps: [],
    usage
  };
}

module.exports = {
  analyzeError,
  generateReport,
  analyzeTestResults
};
