const fs = require('fs-extra');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'database.json');

// 初始化数据库
async function initDB() {
  await fs.ensureFile(dbPath);
  const data = await fs.readJson(dbPath).catch(() => ({ projects: [], testCases: [], reports: [], crawlCache: [] }));
  return data;
}

let dbData = null;

// 加载数据库
async function loadDB() {
  if (!dbData) {
    dbData = await initDB();
  }
  return dbData;
}

// 保存数据库
async function saveDB() {
  await fs.writeJson(dbPath, dbData);
}

// Projects
const projects = {
  async getAll() {
    const data = await loadDB();
    return data.projects;
  },

  async getById(id) {
    const data = await loadDB();
    return data.projects.find(p => p.id === id);
  },

  async create(project) {
    const data = await loadDB();
    data.projects.push(project);
    await saveDB();
    return project;
  },

  async update(id, updates) {
    const data = await loadDB();
    const index = data.projects.findIndex(p => p.id === id);
    if (index !== -1) {
      data.projects[index] = { ...data.projects[index], ...updates };
      await saveDB();
      return data.projects[index];
    }
    return null;
  },

  async delete(id) {
    const data = await loadDB();
    data.projects = data.projects.filter(p => p.id !== id);
    data.testCases = data.testCases.filter(t => t.projectId !== id);
    data.reports = data.reports.filter(r => r.projectId !== id);
    await saveDB();
  }
};

// TestCases
const testCases = {
  async getByProjectId(projectId) {
    const data = await loadDB();
    return data.testCases.filter(t => t.projectId === projectId);
  },

  async getById(id) {
    const data = await loadDB();
    return data.testCases.find(t => t.id === id);
  },

  async create(testCase) {
    const data = await loadDB();
    data.testCases.push(testCase);
    await saveDB();
    return testCase;
  },

  async update(id, updates) {
    const data = await loadDB();
    const index = data.testCases.findIndex(t => t.id === id);
    if (index !== -1) {
      data.testCases[index] = { ...data.testCases[index], ...updates };
      await saveDB();
      return data.testCases[index];
    }
    return null;
  },

  async deleteByProjectId(projectId) {
    const data = await loadDB();
    data.testCases = data.testCases.filter(t => t.projectId !== projectId);
    await saveDB();
  }
};

// Reports
const reports = {
  async getByProjectId(projectId) {
    const data = await loadDB();
    return data.reports.filter(r => r.projectId === projectId).sort((a, b) =>
      new Date(b.generatedAt) - new Date(a.generatedAt)
    );
  },

  async getById(id) {
    const data = await loadDB();
    return data.reports.find(r => r.id === id);
  },

  async getLatest(projectId) {
    const data = await loadDB();
    const projectReports = data.reports.filter(r => r.projectId === projectId);
    return projectReports.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt))[0] || null;
  },

  async create(report) {
    const data = await loadDB();
    data.reports.push(report);
    await saveDB();
    return report;
  },

  async delete(id) {
    const data = await loadDB();
    data.reports = data.reports.filter(r => r.id !== id);
    await saveDB();
  }
};

// CrawlCache
const crawlCache = {
  async get(url) {
    const data = await loadDB();
    const cache = data.crawlCache.find(c => c.url === url && new Date(c.expiresAt) > new Date());
    return cache;
  },

  async set(url, accessibilityTree, screenshot, consoleLogs, pageInfo) {
    const data = await loadDB();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1小时

    const existingIndex = data.crawlCache.findIndex(c => c.url === url);
    const cacheEntry = {
      url,
      accessibilityTree,
      screenshot,
      consoleLogs,
      pageInfo,
      createdAt: new Date().toISOString(),
      expiresAt
    };

    if (existingIndex !== -1) {
      data.crawlCache[existingIndex] = cacheEntry;
    } else {
      data.crawlCache.push(cacheEntry);
    }
    await saveDB();
    return cacheEntry;
  }
};

module.exports = {
  projects,
  testCases,
  reports,
  crawlCache,
  loadDB
};
