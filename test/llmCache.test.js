/**
 * LLM Cache Tests
 */

const { generateTreeHash } = require('../server/services/redis');

describe('LLM Cache - generateKey', () => {
  // 模拟 llmCache.generateKey 的逻辑
  const crypto = require('crypto');

  function generateKey(systemPrompt, userPrompt, options = {}) {
    const { temperature = 0.7, maxTokens = 4000, model, url, treeHash } = options;
    const keyData = JSON.stringify({ systemPrompt, userPrompt, temperature, maxTokens, model, url, treeHash });
    return `llm:${crypto.createHash('md5').update(keyData).digest('hex').substring(0, 16)}`;
  }

  describe('generateKey', () => {
    test('same inputs generate same key', () => {
      const key1 = generateKey('system', 'user', { url: 'http://example.com', treeHash: 'abc123' });
      const key2 = generateKey('system', 'user', { url: 'http://example.com', treeHash: 'abc123' });
      expect(key1).toBe(key2);
    });

    test('different URL generates different key', () => {
      const key1 = generateKey('system', 'user', { url: 'http://example.com', treeHash: 'abc123' });
      const key2 = generateKey('system', 'user', { url: 'http://other.com', treeHash: 'abc123' });
      expect(key1).not.toBe(key2);
    });

    test('different treeHash generates different key', () => {
      const key1 = generateKey('system', 'user', { url: 'http://example.com', treeHash: 'abc123' });
      const key2 = generateKey('system', 'user', { url: 'http://example.com', treeHash: 'xyz789' });
      expect(key1).not.toBe(key2);
    });

    test('different prompt generates different key', () => {
      const key1 = generateKey('system', 'user1', { url: 'http://example.com', treeHash: 'abc123' });
      const key2 = generateKey('system', 'user2', { url: 'http://example.com', treeHash: 'abc123' });
      expect(key1).not.toBe(key2);
    });

    test('same URL and treeHash but different prompt generates different key', () => {
      // This is the key requirement: URL + treeHash + prompt all must match
      const key1 = generateKey('system', 'test login', { url: 'http://example.com', treeHash: 'page1' });
      const key2 = generateKey('system', 'test search', { url: 'http://example.com', treeHash: 'page1' });
      expect(key1).not.toBe(key2);
    });
  });

  describe('cache key format', () => {
    test('key starts with llm: prefix', () => {
      const key = generateKey('system', 'user', { url: 'http://example.com', treeHash: 'abc' });
      expect(key.startsWith('llm:')).toBe(true);
    });

    test('key is 20 characters long (llm: + 16 hex)', () => {
      const key = generateKey('system', 'user', { url: 'http://example.com', treeHash: 'abc' });
      expect(key.length).toBe(20);
    });
  });
});
