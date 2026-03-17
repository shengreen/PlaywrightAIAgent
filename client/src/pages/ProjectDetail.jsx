import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProject, getTestCases, generateForProject, runProjectTests, getLatestReport } from '../services/api';

function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [testCases, setTestCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, description: '' });
  const [report, setReport] = useState(null);
  const [activeTab, setActiveTab] = useState('tests');
  const [instruction, setInstruction] = useState('');

  useEffect(() => {
    loadProject();
  }, [id]);

  const loadProject = async () => {
    try {
      const res = await getProject(id);
      setProject(res.data);
      setTestCases(res.data.testCases || []);

      // 获取最新报告
      const reportRes = await getLatestReport(id);
      if (reportRes.data) {
        setReport(reportRes.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await generateForProject(id, { instruction });
      setTestCases(res.data.tests);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to generate tests');
    } finally {
      setGenerating(false);
    }
  };

  const handleRunTests = async () => {
    setRunning(true);
    setProgress({ current: 0, total: testCases.length, description: 'Starting...' });

    try {
      // 使用 EventSource 监听进度
      const eventSource = new EventSource(`http://localhost:3001/api/test/run-project/${id}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'progress') {
          setProgress({
            current: data.current,
            total: data.total,
            description: data.description
          });
        } else if (data.type === 'complete') {
          setReport(data.report);
          eventSource.close();
          setRunning(false);
          loadProject();
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        eventSource.close();
        setRunning(false);
      };
    } catch (err) {
      console.error(err);
      alert('Failed to run tests');
      setRunning(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!project) {
    return <div className="error">Project not found</div>;
  }

  return (
    <div className="project-detail">
      <div className="project-header">
        <h1>{project.name}</h1>
        <div className="project-meta">
          <p>URLs: {project.urls?.join(', ')}</p>
          <p>Created: {new Date(project.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'tests' ? 'active' : ''}`}
          onClick={() => setActiveTab('tests')}
        >
          Test Cases ({testCases.length})
        </button>
        <button
          className={`tab ${activeTab === 'run' ? 'active' : ''}`}
          onClick={() => setActiveTab('run')}
        >
          Run Tests
        </button>
        <button
          className={`tab ${activeTab === 'report' ? 'active' : ''}`}
          onClick={() => setActiveTab('report')}
        >
          Report
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'tests' && (
          <div className="tests-tab">
            <div className="generate-section">
              <h3>Generate Test Cases</h3>
              <textarea
                value={instruction}
                onChange={e => setInstruction(e.target.value)}
                placeholder="Optional: Describe what to test (e.g., 'Test login functionality', 'Test shopping cart')"
                rows={3}
              />
              <button
                onClick={handleGenerate}
                disabled={generating || project.urls?.length === 0}
                className="btn btn-primary"
              >
                {generating ? 'Generating...' : 'Generate Test Cases'}
              </button>
            </div>

            {testCases.length > 0 ? (
              <div className="test-list">
                <h3>Generated Test Cases ({testCases.length})</h3>
                {testCases.map((tc, idx) => (
                  <div key={tc.id} className={`test-item status-${tc.status}`}>
                    <div className="test-info">
                      <span className="test-number">#{idx + 1}</span>
                      <span className="test-desc">{tc.description}</span>
                    </div>
                    <span className={`status-badge ${tc.status}`}>{tc.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>No test cases yet. Generate some test cases above.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'run' && (
          <div className="run-tab">
            {running ? (
              <div className="progress-section">
                <h3>Running Tests...</h3>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
                <p>{progress.current} / {progress.total} - {progress.description}</p>
              </div>
            ) : (
              <div className="run-actions">
                <button
                  onClick={handleRunTests}
                  disabled={testCases.length === 0}
                  className="btn btn-primary btn-large"
                >
                  Run All Tests ({testCases.length})
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'report' && (
          <div className="report-tab">
            {report ? (
              <div className="report-summary">
                <h3>Test Summary</h3>
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

                <h4>Failed Tests</h4>
                <div className="failed-tests">
                  {(report.testResults || []).filter(t => !t.passed).map((tc, idx) => (
                    <div key={idx} className={`failed-test-item error-${tc.errorType}`}>
                      <div className="failed-test-header">
                        <span className="test-desc">{tc.description}</span>
                        <span className={`error-type-badge ${tc.errorType}`}>{tc.errorType}</span>
                      </div>
                      {tc.errorMessage && (
                        <pre className="error-message">{tc.errorMessage.substring(0, 500)}</pre>
                      )}
                    </div>
                  ))}
                  {(report.testResults || []).filter(t => !t.passed).length === 0 && (
                    <p>No failed tests!</p>
                  )}
                </div>

                <p className="report-date">
                  Generated: {new Date(report.generatedAt).toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="empty-state">
                <p>No report yet. Run tests to see results.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProjectDetail;
