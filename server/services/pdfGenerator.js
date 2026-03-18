const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// 字体路径
const FONTS_DIR = path.join(__dirname, 'fonts');
const CHINESE_FONT = path.join(FONTS_DIR, 'NotoSansSC-Regular.ttf');

// 注册中文字体
let chineseFontRegistered = false;
function registerChineseFont(doc) {
  if (!chineseFontRegistered && fs.existsSync(CHINESE_FONT)) {
    doc.registerFont('Chinese', CHINESE_FONT);
    chineseFontRegistered = true;
  }
}

// Simple text sanitizer - removes or replaces problematic characters
function sanitizeText(text) {
  if (!text) return '';
  return String(text)
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .trim();
}

/**
 * 生成测试报告 PDF
 * @param {Object} reportData - 报告数据
 * @param {string} url - 测试的 URL
 * @returns {Buffer} PDF Buffer
 */
async function generatePDFReport(reportData, url) {
  return new Promise((resolve, reject) => {
    try {
      const { total, passed, failed, environmentErrors, scriptErrors, bugs, details, aiAnalysis } = reportData;

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      // 注册中文字体
      registerChineseFont(doc);

      // 设置默认字体（在颜色之前）
      if (chineseFontRegistered) {
        doc.font('Chinese');
      }

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Title
      doc.fontSize(24).fillColor('#4f46e5').text('WebTestAgent Report', { align: 'center' });
      doc.moveDown(0.5);

      // URL and Date
      doc.fontSize(10).fillColor('#64748b');
      doc.text(`URL: ${url}`, { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown();

      // Summary Section
      doc.fontSize(16).fillColor('#0f172a').text('Test Summary', { underline: true });
      doc.moveDown(0.5);

      // Stats
      const stats = [
        { label: 'Total', value: total, color: '#0f172a' },
        { label: 'Passed', value: passed, color: '#16a34a' },
        { label: 'Failed', value: failed, color: '#dc2626' },
        { label: 'Environment', value: environmentErrors, color: '#9333ea' },
        { label: 'Script Errors', value: scriptErrors, color: '#d97706' },
        { label: 'Bugs', value: bugs, color: '#db2777' }
      ];

      const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

      doc.fontSize(12);
      doc.text(`Pass Rate: ${passRate}%`, { continued: false });
      doc.moveDown(0.5);

      // Draw stats table
      let x = 50;
      stats.forEach((stat, i) => {
        doc.rect(x, doc.y, 80, 25).fill('#f8fafc').stroke('#e2e8f0');
        doc.fillColor('#64748b').fontSize(9).text(stat.label, x + 5, doc.y - 20, { width: 70, align: 'center' });
        doc.fillColor(stat.color).fontSize(14).text(stat.value.toString(), x + 5, doc.y - 8, { width: 70, align: 'center' });
        x += 85;
        if ((i + 1) % 3 === 0) {
          x = 50;
          doc.moveDown(1.5);
        }
      });

      doc.moveDown(2);

      // Test Results
      if (details && details.length > 0) {
        doc.fontSize(16).fillColor('#0f172a').text('Test Results', { underline: true });
        doc.moveDown(0.5);

        details.forEach((result, idx) => {
          const y = doc.y;
          const status = result.passed ? 'PASSED' : 'FAILED';
          const statusColor = result.passed ? '#16a34a' : '#dc2626';

          // Status indicator
          doc.circle(x + 5, y + 5, 4).fill(statusColor);

          doc.fontSize(10).fillColor('#0f172a').text(`${idx + 1}. ${sanitizeText(result.description)}`, x + 15, y);
          doc.moveDown(0.3);

          doc.fontSize(9).fillColor(statusColor).text(`Status: ${status}`);

          if (result.errorType) {
            doc.fillColor('#64748b').text(`Error Type: ${result.errorType}`);
          }

          if (result.errorMessage) {
            doc.fillColor('#64748b').text(`Error: ${result.errorMessage.substring(0, 200)}`);
          }

          doc.moveDown(0.8);
        });
      }

      // AI Analysis
      if (aiAnalysis) {
        doc.addPage();
        doc.fontSize(16).fillColor('#4f46e5').text('AI Analysis', { underline: true });
        doc.moveDown(0.5);

        if (aiAnalysis.overallStatus) {
          doc.fontSize(12).fillColor('#0f172a').text(`Overall Status: ${aiAnalysis.overallStatus.toUpperCase()}`);
          doc.moveDown(0.5);
        }

        if (aiAnalysis.summary) {
          doc.fontSize(12).fillColor('#0f172a').text('Summary:');
          doc.fontSize(10).fillColor('#64748b').text(aiAnalysis.summary);
          doc.moveDown(0.5);
        }

        if (aiAnalysis.keyIssues && aiAnalysis.keyIssues.length > 0) {
          doc.fontSize(12).fillColor('#0f172a').text('Key Issues:');
          doc.fontSize(10).fillColor('#64748b');
          aiAnalysis.keyIssues.forEach((issue, idx) => {
            doc.text(`${idx + 1}. ${issue}`);
          });
          doc.moveDown(0.5);
        }

        if (aiAnalysis.recommendations && aiAnalysis.recommendations.length > 0) {
          doc.fontSize(12).fillColor('#0f172a').text('Recommendations:');
          doc.fontSize(10).fillColor('#64748b');
          aiAnalysis.recommendations.forEach((rec, idx) => {
            doc.text(`${idx + 1}. ${rec}`);
          });
          doc.moveDown(0.5);
        }

        if (aiAnalysis.nextSteps && aiAnalysis.nextSteps.length > 0) {
          doc.fontSize(12).fillColor('#0f172a').text('Next Steps:');
          doc.fontSize(10).fillColor('#64748b');
          aiAnalysis.nextSteps.forEach((step, idx) => {
            doc.text(`${idx + 1}. ${step}`);
          });
        }
      }

      // Footer
      doc.moveDown(2);
      doc.fontSize(8).fillColor('#94a3b8').text('Generated by WebTestAgent', { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generatePDFReport
};
