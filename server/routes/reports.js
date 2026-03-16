const express = require('express');
const db = require('../db');

const router = express.Router();

// 获取项目的所有报告
router.get('/project/:projectId', async (req, res) => {
  try {
    const reports = await db.reports.getByProjectId(req.params.projectId);
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取单个报告
router.get('/:id', async (req, res) => {
  try {
    const report = await db.reports.getById(req.params.id);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // 获取失败的测试详情
    const failedTests = (report.testResults || []).filter(t => !t.passed);
    report.failedTests = failedTests;

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取最新报告
router.get('/latest/:projectId', async (req, res) => {
  try {
    const report = await db.reports.getLatest(req.params.projectId);

    if (!report) {
      return res.status(404).json({ error: 'No report found' });
    }

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除报告
router.delete('/:id', async (req, res) => {
  try {
    await db.reports.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
