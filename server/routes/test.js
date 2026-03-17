const express = require('express');
const db = require('../db');
const { runTest, runAllTests } = require('../services/runner');
const { generateReport, analyzeTestResults } = require('../services/analyzer');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// 执行单个测试
router.post('/run', async (req, res) => {
  try {
    const { testCaseId } = req.body;

    if (!testCaseId) {
      return res.status(400).json({ error: 'testCaseId is required' });
    }

    // 获取测试用例
    const testCase = await db.testCases.getById(testCaseId);
    if (!testCase) {
      return res.status(404).json({ error: 'Test case not found' });
    }

    // 更新状态为运行中
    await db.testCases.update(testCaseId, { status: 'running' });

    // 执行测试
    const result = await runTest(testCase);

    // 更新测试结果
    const status = result.passed ? 'passed' : 'failed';
    await db.testCases.update(testCaseId, {
      status,
      errorType: result.errorType,
      errorMessage: result.errorMessage,
      screenshots: { screenshot: result.screenshot }
    });

    res.json({
      testCaseId,
      ...result
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 执行项目所有测试
router.post('/run-project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    // 获取项目所有测试用例
    const testCases = await db.testCases.getByProjectId(projectId);

    if (testCases.length === 0) {
      return res.status(400).json({ error: 'No test cases found for this project' });
    }

    // 使用 Server-Sent Events 流式返回进度
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // 执行所有测试
    const testResults = await runAllTests(testCases, (current, total, description) => {
      sendEvent({ type: 'progress', current, total, description });
    });

    // 生成报告
    const report = generateReport(testResults, projectId);

    // 保存报告
    await db.reports.create(report);

    sendEvent({ type: 'complete', report });

    res.end();

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取测试用例列表
router.get('/cases/:projectId', async (req, res) => {
  try {
    const testCases = await db.testCases.getByProjectId(req.params.projectId);
    res.json(testCases);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取单个测试详情
router.get('/case/:id', async (req, res) => {
  try {
    const testCase = await db.testCases.getById(req.params.id);

    if (!testCase) {
      return res.status(404).json({ error: 'Test case not found' });
    }

    res.json(testCase);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 直接运行测试脚本（不需要保存到数据库）
router.post('/run-script', async (req, res) => {
  try {
    const { url, script, description } = req.body;

    if (!url || !script) {
      return res.status(400).json({ error: 'url and script are required' });
    }

    // 构造临时测试用例
    const testCase = {
      id: 'temp-' + Date.now(),
      url,
      description: description || 'Quick test',
      script
    };

    // 执行测试
    const result = await runTest(testCase);

    res.json({
      url,
      description: testCase.description,
      ...result
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// AI 分析测试结果
router.post('/analyze', async (req, res) => {
  try {
    const { results, url } = req.body;

    if (!results || !Array.isArray(results)) {
      return res.status(400).json({ error: 'results array is required' });
    }

    // 调用 AI 分析
    const analysis = await analyzeTestResults(results, url || '');

    res.json({
      analysis,
      usage: analysis.usage
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
