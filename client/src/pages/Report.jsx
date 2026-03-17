import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getReport } from '../services/api';

function Report() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, [id]);

  const loadReport = async () => {
    try {
      const res = await getReport(id);
      setReport(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!report) {
    return <div className="error">Report not found</div>;
  }

  return (
    <div className="report-page">
      <div className="report-header">
        <Link to={`/project/${report.projectId}`} className="back-link">Back to Project</Link>
        <h1>Test Report</h1>
        <p className="report-date">Generated: {new Date(report.generatedAt).toLocaleString()}</p>
      </div>

      <div className="summary-cards">
        <div className="summary-card total">
          <div className="card-value">{report.summary?.total || 0}</div>
          <div className="card-label">Total</div>
        </div>
        <div className="summary-card passed">
          <div className="card-value">{report.summary?.passed || 0}</div>
          <div className="card-label">Passed</div>
        </div>
        <div className="summary-card failed">
          <div className="card-value">{report.summary?.failed || 0}</div>
          <div className="card-label">Failed</div>
        </div>
        <div className="summary-card environment">
          <div className="card-value">{report.summary?.environmentErrors || 0}</div>
          <div className="card-label">Environment</div>
        </div>
        <div className="summary-card script">
          <div className="card-value">{report.summary?.scriptErrors || 0}</div>
          <div className="card-label">Script Errors</div>
        </div>
        <div className="summary-card bug">
          <div className="card-value">{report.summary?.bugs || 0}</div>
          <div className="card-label">Bugs</div>
        </div>
      </div>

      <h2>Test Results</h2>
      <div className="results-table">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Test Description</th>
              <th>Error Type</th>
            </tr>
          </thead>
          <tbody>
            {(report.testResults || []).map((tc, idx) => (
              <tr key={idx} className={tc.passed ? 'passed' : 'failed'}>
                <td>
                  <span className={`status-badge ${tc.passed ? 'passed' : 'failed'}`}>
                    {tc.passed ? 'PASSED' : 'FAILED'}
                  </span>
                </td>
                <td>{tc.description}</td>
                <td>
                  {tc.errorType && (
                    <span className={`error-type-badge ${tc.errorType}`}>
                      {tc.errorType}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Report;
