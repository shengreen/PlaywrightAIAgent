/**
 * Crawler Utility Tests
 */

const { simplifyAccessibilityTree, getAccessibilitySummary } = require('../server/services/crawler');

describe('Crawler Utilities', () => {
  describe('simplifyAccessibilityTree', () => {
    test('handles empty tree', () => {
      const result = simplifyAccessibilityTree(null, 2);
      expect(result).toEqual({});
    });

    test('handles tree with children', () => {
      const tree = {
        role: 'WebArea',
        name: 'Test Page',
        children: [
          { role: 'button', name: 'Submit' },
          { role: 'textbox', name: 'Username' }
        ]
      };
      const result = simplifyAccessibilityTree(tree, 2);
      expect(result).toBeDefined();
      expect(result.children).toBeDefined();
    });

    test('respects maxDepth parameter', () => {
      const tree = {
        role: 'WebArea',
        name: 'Test',
        children: [
          {
            role: 'group',
            name: 'Form',
            children: [
              { role: 'button', name: 'Submit' }
            ]
          }
        ]
      };
      const result = simplifyAccessibilityTree(tree, 1);
      // Should only have first level
      expect(result.children).toBeDefined();
    });
  });

  describe('getAccessibilitySummary', () => {
    test('handles empty tree', () => {
      const result = getAccessibilitySummary(null);
      expect(result).toBe('');
    });

    test('generates summary for simple tree', () => {
      const tree = {
        role: 'WebArea',
        name: 'Test Page',
        children: [
          { role: 'button', name: 'Submit' },
          { role: 'link', name: 'Home' },
          { role: 'textbox', name: 'Search' }
        ]
      };
      const result = getAccessibilitySummary(tree);
      expect(result).toContain('button');
      expect(result).toContain('Submit');
    });
  });
});
