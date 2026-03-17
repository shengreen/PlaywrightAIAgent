/**
 * PDF Generator Tests
 */

const path = require('path');

// Load the PDF generator
const { generatePDFReport } = require('../server/services/pdfGenerator');

describe('PDF Generator', () => {
  describe('sanitizeText', () => {
    const { generatePDFReport } = require('../server/services/pdfGenerator');

    // Extract the sanitizeText function from the module
    let sanitizeText;
    beforeAll(() => {
      // We need to test through generatePDFReport since sanitizeText is not exported
      // This test verifies the PDF generation works with various inputs
    });

    test('generates PDF with valid data', async () => {
      const reportData = {
        total: 10,
        passed: 8,
        failed: 2,
        environmentErrors: 1,
        scriptErrors: 1,
        bugs: 0,
        details: [
          { description: 'Test 1', passed: true },
          { description: 'Test 2', passed: false, errorType: 'bug', errorMessage: 'Assertion failed' }
        ],
        aiAnalysis: {
          overallStatus: 'warning',
          summary: '2 tests failed',
          keyIssues: ['Login issue'],
          recommendations: ['Fix login flow'],
          nextSteps: ['Run again']
        }
      };

      const pdfBuffer = await generatePDFReport(reportData, 'http://example.com');
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    test('handles empty details', async () => {
      const reportData = {
        total: 0,
        passed: 0,
        failed: 0,
        environmentErrors: 0,
        scriptErrors: 0,
        bugs: 0,
        details: []
      };

      const pdfBuffer = await generatePDFReport(reportData, 'http://example.com');
      expect(pdfBuffer).toBeInstanceOf(Buffer);
    });

    test('handles special characters in description', async () => {
      const reportData = {
        total: 1,
        passed: 1,
        failed: 0,
        environmentErrors: 0,
        scriptErrors: 0,
        bugs: 0,
        details: [
          { description: 'Test with "quotes" and <tags>', passed: true }
        ]
      };

      const pdfBuffer = await generatePDFReport(reportData, 'http://example.com');
      expect(pdfBuffer).toBeInstanceOf(Buffer);
    });
  });
});
