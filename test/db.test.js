/**
 * Database Tests - Simplified
 */

const db = require('../server/db');

describe('Database', () => {
  beforeAll(async () => {
    await db.loadDB();
  });

  test('loads successfully', () => {
    expect(db.projects).toBeDefined();
    expect(db.testCases).toBeDefined();
    expect(db.reports).toBeDefined();
  });

  test('projects has required methods', () => {
    expect(typeof db.projects.create).toBe('function');
    expect(typeof db.projects.getById).toBe('function');
    expect(typeof db.projects.getAll).toBe('function');
    expect(typeof db.projects.delete).toBe('function');
  });

  test('testCases has required methods', () => {
    expect(typeof db.testCases.create).toBe('function');
    expect(typeof db.testCases.getById).toBe('function');
    expect(typeof db.testCases.getByProjectId).toBe('function');
    expect(typeof db.testCases.update).toBe('function');
  });

  test('reports has required methods', () => {
    expect(typeof db.reports.create).toBe('function');
    expect(typeof db.reports.getById).toBe('function');
    expect(typeof db.reports.getByProjectId).toBe('function');
  });
});
