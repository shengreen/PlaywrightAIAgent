/**
 * Redis Cache Tests
 */

const { generateTreeHash } = require('../server/services/redis');

describe('Redis Cache - generateTreeHash', () => {
  describe('generateTreeHash', () => {
    test('returns empty string for null tree', () => {
      const result = generateTreeHash(null);
      expect(result).toBe('');
    });

    test('returns consistent hash for same tree structure', () => {
      const tree = {
        role: 'RootWebArea',
        name: 'Test Page',
        children: [
          { role: 'button', name: 'Submit' },
          { role: 'textbox', name: 'Username' },
          { role: 'link', name: 'Home' }
        ]
      };

      const hash1 = generateTreeHash(tree);
      const hash2 = generateTreeHash(tree);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(12);
    });

    test('returns different hash for different tree content', () => {
      const tree1 = {
        role: 'RootWebArea',
        name: 'Page A',
        children: [
          { role: 'button', name: 'Submit' }
        ]
      };

      const tree2 = {
        role: 'RootWebArea',
        name: 'Page B',
        children: [
          { role: 'button', name: 'Cancel' }
        ]
      };

      const hash1 = generateTreeHash(tree1);
      const hash2 = generateTreeHash(tree2);

      expect(hash1).not.toBe(hash2);
    });

    test('detects page content change (same URL, different content)', () => {
      // Simulates: same URL but page content changed
      const oldTree = {
        role: 'RootWebArea',
        name: 'Login Page',
        children: [
          { role: 'textbox', name: 'Username' },
          { role: 'textbox', name: 'Password' },
          { role: 'button', name: 'Login' }
        ]
      };

      const newTree = {
        role: 'RootWebArea',
        name: 'Login Page',
        children: [
          { role: 'textbox', name: 'Username' },
          { role: 'textbox', name: 'Password' },
          { role: 'button', name: 'Login' },
          { role: 'link', name: 'Forgot Password' }  // New element added
        ]
      };

      const oldHash = generateTreeHash(oldTree);
      const newHash = generateTreeHash(newTree);

      // Hash should be different because content changed
      expect(oldHash).not.toBe(newHash);
    });

    test('handles nested children structure', () => {
      const tree = {
        role: 'RootWebArea',
        name: 'Complex Page',
        children: [
          {
            role: 'group',
            name: 'Navigation',
            children: [
              { role: 'link', name: 'Home' },
              { role: 'link', name: 'About' }
            ]
          },
          {
            role: 'group',
            name: 'Form',
            children: [
              { role: 'textbox', name: 'Email' }
            ]
          }
        ]
      };

      const hash = generateTreeHash(tree);
      expect(hash).toHaveLength(12);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });
  });
});
