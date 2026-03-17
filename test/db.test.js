/**
 * Database Tests
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

  test('can create and get project', async () => {
    const project = {
      name: 'Test Project',
      urls: ['http://example.com']
    };

    const created = await db.projects.create(project);
    expect(created.id).toBeDefined();

    const retrieved = await db.projects.getById(created.id);
    expect(retrieved.name).toBe('Test Project');

    // Cleanup
    await db.projects.delete(created.id);
  });

  test('can create and get test case', async () => {
    // First create a project
    const project = await db.projects.create({
      name: 'Test Project for Cases',
      urls: ['http://example.com']
    });

    const testCase = {
      projectId: project.id,
      url: 'http://example.com',
      description: 'Test case',
      script: 'test("example", async ({ page }) => {});'
    };

    const created = await db.testCases.create(testCase);
    expect(created.id).toBeDefined();

    const retrieved = await db.testCases.getById(created.id);
    expect(retrieved.description).toBe('Test case');

    // Cleanup
    await db.testCases.delete(created.id);
    await db.projects.delete(project.id);
  });

  test('can get test cases by project', async () => {
    const project = await db.projects.create({
      name: 'Test Project for Query',
      urls: ['http://example.com']
    });

    await db.testCases.create({
      projectId: project.id,
      url: 'http://example.com',
      description: 'Test 1',
      script: 'test1'
    });

    await db.testCases.create({
      projectId: project.id,
      url: 'http://example.com',
      description: 'Test 2',
      script: 'test2'
    });

    const cases = await db.testCases.getByProjectId(project.id);
    expect(cases.length).toBe(2);

    // Cleanup
    for (const c of cases) {
      await db.testCases.delete(c.id);
    }
    await db.projects.delete(project.id);
  });
});
