const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const router = express.Router();

// 创建项目
router.post('/', async (req, res) => {
  try {
    const { name, urls } = req.body;

    if (!name || !urls || !Array.isArray(urls)) {
      return res.status(400).json({ error: 'name and urls array are required' });
    }

    const id = uuidv4();
    const project = {
      id,
      name,
      urls,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.projects.create(project);

    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 列表项目
router.get('/', async (req, res) => {
  try {
    const projects = await db.projects.getAll();
    res.json(projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取单个项目
router.get('/:id', async (req, res) => {
  try {
    const project = await db.projects.getById(req.params.id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // 获取关联的测试用例
    const testCases = await db.testCases.getByProjectId(req.params.id);
    project.testCases = testCases;

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除项目
router.delete('/:id', async (req, res) => {
  try {
    await db.projects.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
