const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { crawlAccessibilityTree, getAccessibilitySummary } = require('../services/crawler');
const { generateTests } = require('../services/generator');

const router = express.Router();

// 生成测试用例
router.post('/testcases', async (req, res) => {
  try {
    const { url, instruction, preScript, waitFor } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'url is required' });
    }

    // 抓取页面
    const crawlResult = await crawlAccessibilityTree(url, {
      preScript,
      waitFor: waitFor || 3000
    });

    // 生成测试用例
    const result = await generateTests(url, crawlResult, instruction);
    const tests = result.tests;
    const usage = result.usage;

    res.json({
      url,
      testCount: tests.length,
      tests,
      usage,
      crawledAt: crawlResult.crawledAt,
      cached: crawlResult.cached
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 保存测试用例到项目
router.post('/save', async (req, res) => {
  try {
    const { projectId, tests } = req.body;

    if (!projectId || !tests || !Array.isArray(tests)) {
      return res.status(400).json({ error: 'projectId and tests array are required' });
    }

    // 验证项目存在
    const project = await db.projects.getById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // 保存测试用例
    const savedTests = [];

    for (const test of tests) {
      const id = uuidv4();
      const testCase = {
        id,
        projectId,
        url: test.url,
        description: test.description,
        script: test.script,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      await db.testCases.create(testCase);
      savedTests.push(testCase);
    }

    res.json({
      success: true,
      savedCount: savedTests.length,
      tests: savedTests
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 为项目生成并保存测试
router.post('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { instruction, preScript, waitFor } = req.body;

    // 验证项目存在
    const project = await db.projects.getById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const urls = project.urls;
    const allTests = [];

    for (const url of urls) {
      // 抓取页面
      const crawlResult = await crawlAccessibilityTree(url, {
        preScript,
        waitFor: waitFor || 3000
      });

      // 生成测试
      const tests = await generateTests(url, crawlResult, instruction);

      // 保存到数据库
      for (const test of tests) {
        const id = uuidv4();
        const testCase = {
          id,
          projectId,
          url,
          description: test.description,
          script: test.script,
          status: 'pending',
          createdAt: new Date().toISOString()
        };
        await db.testCases.create(testCase);
        allTests.push(testCase);
      }
    }

    res.json({
      success: true,
      projectId,
      totalTests: allTests.length,
      tests: allTests
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
