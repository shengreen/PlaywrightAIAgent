/**
 * Analyzer Tests - Error Classification
 */

// Mock the LLM to avoid API calls
jest.mock('../server/services/llm', () => ({
  callLLM: jest.fn()
}));

const { classifyErrorByRules } = require('../server/services/runner');

describe('Error Classification', () => {
  test('classifies timeout as environment error', () => {
    const result = classifyErrorByRules('Timeout: Navigation took too long', []);
    expect(result).toBe('environment');
  });

  test('classifies network error as environment error', () => {
    const result = classifyErrorByRules('Failed to fetch: Network error', []);
    expect(result).toBe('environment');
  });

  test('classifies syntax error as script error', () => {
    const result = classifyErrorByRules('SyntaxError: Unexpected token', []);
    expect(result).toBe('script');
  });

  test('classifies reference error as script error', () => {
    const result = classifyErrorByRules('ReferenceError: foo is not defined', []);
    expect(result).toBe('script');
  });

  test('classifies type error as script error', () => {
    const result = classifyErrorByRules('TypeError: Cannot read property of undefined', []);
    expect(result).toBe('script');
  });

  test('classifies assertion failure as bug', () => {
    const result = classifyErrorByRules('Assertion failed: expected "foo" to be "bar"', []);
    expect(result).toBe('bug');
  });
});
