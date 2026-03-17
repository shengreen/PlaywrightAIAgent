import { useState, useRef } from 'react';
import { crawlUrl, generateTestCases, runScript, analyzeResults, generatePDF } from '../services/api';

const WORKFLOW_STEPS = [
  { id: 'input', label: 'Input URL', description: 'Enter the URL to test' },
  { id: 'crawl', label: 'Crawl Page', description: 'Collect accessibility tree' },
  { id: 'generate', label: 'Generate Tests', description: 'Create test cases with AI' },
  { id: 'script', label: 'Generate Scripts', description: 'Create Playwright scripts' },
  { id: 'run', label: 'Run Tests', description: 'Execute automation scripts' },
  { id: 'analyze', label: 'Generate Report', description: 'Analyze and generate report' }
];

function TreeNode({ node, level = 0, defaultExpanded = true, onSelect, selectedPath }) {
  const [expanded, setExpanded] = useState(defaultExpanded && level < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedPath === node.path;

  const handleClick = () => {
    if (hasChildren) setExpanded(!expanded);
    if (!hasChildren && node.data && onSelect) onSelect(node.path);
  };

  return (
    <div className="tree-node" style={{ marginLeft: level * 16 }}>
      <div className={`tree-item ${isSelected ? 'selected' : ''}`} onClick={handleClick}>
        <span className="tree-toggle">{hasChildren ? (expanded ? '▼' : '▶') : '●'}</span>
        <span className="tree-icon">{node.type === 'folder' ? '📁' : '📄'}</span>
        <span className="tree-label">{node.label}</span>
        {node.status && <span className={`tree-status ${node.status}`}>{node.status === 'passed' ? '✓' : '✗'}</span>}
      </div>
      {hasChildren && expanded && node.children.map((child, idx) => (
        <TreeNode key={idx} node={{ ...child, path: child.path || ((node.path || '') + '/' + idx) }} level={level + 1} onSelect={onSelect} selectedPath={selectedPath} />
      ))}
    </div>
  );
}

// Sanitize text - remove control characters
function sanitizeText(text) {
  if (!text) return '';
  return String(text).replace(/[\x00-\x1F\x7F]/g, '').trim();
}

function highlightCode(code) {
  if (!code) return null;
  // Simple syntax highlighting
  return code
    .replace(/(const|let|var|function|return|if|else|for|while|async|await|import|export|from|class|try|catch|throw|new|this|typeof|instanceof)/g, '<span class="keyword">$1</span>')
    .replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, '<span class="string">$&</span>')
    .replace(/(\/\/.*$)/gm, '<span class="comment">$1</span>')
    .replace(/\b(\d+)\b/g, '<span class="number">$1</span>')
    .replace(/(\w+)(\s*\()/g, '<span class="function">$1</span>$2')
    .replace(/\.((\w+))/g, '<span class="property">.$1</span>');
}

function ContentViewer({ data, onDownloadPdf }) {
  if (!data) return <div className="content-empty">Select a node to view its content</div>;
  if (data.type === 'screenshot' && data.content) return <div className="content-image"><img src={`data:image/png;base64,${data.content}`} alt="Screenshot" /></div>;
  if (data.type === 'analysis' && data.content) {
    const { total, passed, failed, environmentErrors, scriptErrors, bugs, aiAnalysis } = data.content;
    return (
      <div className="analysis-content">
        <div className="analysis-header">
          <div className="analysis-summary">
            <h4>Test Summary</h4>
            <div className="analysis-stats">
              <div className="stat passed"><span className="stat-value">{passed}</span><span>Passed</span></div>
              <div className="stat failed"><span className="stat-value">{failed}</span><span>Failed</span></div>
              <div className="stat env"><span className="stat-value">{environmentErrors}</span><span>Env</span></div>
              <div className="stat script"><span className="stat-value">{scriptErrors}</span><span>Script</span></div>
              <div className="stat bug"><span className="stat-value">{bugs}</span><span>Bugs</span></div>
            </div>
          </div>
          {onDownloadPdf && (
            <button className="btn btn-primary" onClick={onDownloadPdf} style={{ marginTop: '0.5rem' }}>
              📥 Download PDF
            </button>
          )}
        </div>
        {aiAnalysis && (
          <div className="analysis-ai">
            <h4>🤖 AI Analysis</h4>
            <div className="analysis-section">
              <strong>Status:</strong> <span className={`status-${aiAnalysis.overallStatus}`}>{aiAnalysis.overallStatus?.toUpperCase()}</span>
            </div>
            {aiAnalysis.summary && (
              <div className="analysis-section">
                <strong>Summary:</strong>
                <p>{aiAnalysis.summary}</p>
              </div>
            )}
            {aiAnalysis.keyIssues && aiAnalysis.keyIssues.length > 0 && (
              <div className="analysis-section">
                <strong>Key Issues:</strong>
                <ul>{aiAnalysis.keyIssues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
              </div>
            )}
            {aiAnalysis.recommendations && aiAnalysis.recommendations.length > 0 && (
              <div className="analysis-section">
                <strong>Recommendations:</strong>
                <ul>{aiAnalysis.recommendations.map((rec, i) => <li key={i}>{rec}</li>)}</ul>
              </div>
            )}
            {aiAnalysis.nextSteps && aiAnalysis.nextSteps.length > 0 && (
              <div className="analysis-section">
                <strong>Next Steps:</strong>
                <ul>{aiAnalysis.nextSteps.map((step, i) => <li key={i}>{step}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  if ((data.type === 'code' || data.type === 'json') && data.content) {
    const content = data.type === 'json' ? JSON.stringify(data.content, null, 2) : data.content;
    return <pre className="content-code" dangerouslySetInnerHTML={{ __html: highlightCode(content) }} />;
  }
  return <div className="content-empty">No content to display</div>;
}

function MiniTest() {
  const [url, setUrl] = useState('http://localhost:3001/demo-shop.html');
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [runningStep, setRunningStep] = useState(null);
  const [stopRequested, setStopRequested] = useState(false);
  const stopRequestedRef = useRef(false);
  const [currentStep, setCurrentStep] = useState('input');
  const [completedSteps, setCompletedSteps] = useState([]);
  const [stepData, setStepData] = useState({});
  const [stepOutputs, setStepOutputs] = useState({});
  const [totalTokens, setTotalTokens] = useState({ prompt: 0, completion: 0, total: 0 });
  const [selectedNode, setSelectedNode] = useState(null);
  const [error, setError] = useState(null);

  const calculateTotalTokens = (usage) => {
    let prompt = 0, completion = 0;
    Object.values(usage).forEach(u => { if (u) { prompt += u.prompt_tokens || 0; completion += u.completion_tokens || 0; } });
    setTotalTokens({ prompt, completion, total: prompt + completion });
  };

  const updateStep = (step, data) => { setCurrentStep(step); if (data) setStepData(prev => ({ ...prev, [step]: data })); };
  const completeStep = (step) => { if (!completedSteps.includes(step)) setCompletedSteps(prev => [...prev, step]); };

  const runFromStep = async (fromStepId) => {
    if (!url) { setError('Please enter a URL'); return; }
    const stepIndex = WORKFLOW_STEPS.findIndex(s => s.id === fromStepId);
    if (stepIndex === -1) return;

    let localOutputs = { ...stepOutputs };
    WORKFLOW_STEPS.slice(stepIndex).forEach(s => delete localOutputs[s.id]);
    setStepOutputs(localOutputs);
    setCompletedSteps(WORKFLOW_STEPS.slice(0, stepIndex).map(s => s.id));
    setSelectedNode(null);
    setLoading(true);
    setError(null);
    stopRequestedRef.current = false;

    try {
      for (let i = stepIndex; i < WORKFLOW_STEPS.length; i++) {
        if (stopRequestedRef.current) { setLoading(false); setRunningStep(null); stopRequestedRef.current = false; return; }
        const step = WORKFLOW_STEPS[i];
        setRunningStep(step.id); setCurrentStep(step.id);

        switch (step.id) {
          case 'crawl':
            updateStep('crawl', 'Loading page...');
            const crawlRes = await crawlUrl({ url, waitFor: 3000 });
            if (!crawlRes.data.simplifiedTree?.children?.length) throw new Error('Failed to crawl page');
            localOutputs['crawl'] = { url: crawlRes.data.url, pageInfo: crawlRes.data.pageInfo, tree: crawlRes.data.simplifiedTree, screenshot: crawlRes.data.screenshot };
            setStepOutputs({ ...localOutputs }); completeStep('crawl'); updateStep('crawl', `Page: ${crawlRes.data.pageInfo?.title || url}`);
            break;
          case 'generate':
            const crawlOutput = localOutputs['crawl']; if (!crawlOutput) throw new Error('Please run Crawl step first');
            updateStep('generate', 'Analyzing page structure...');
            const generateRes = await generateTestCases({ url, instruction });
            const allTests = generateRes.data.tests || [];
            if (!allTests.length) throw new Error('Failed to generate test cases');
            const usage = generateRes.data.usage;
            calculateTotalTokens({ generate: usage });
            // 流式显示 test cases
            updateStep('generate', `Generating test 1/${allTests.length}...`);
            for (let i = 0; i < allTests.length; i++) {
              if (stopRequestedRef.current) { setLoading(false); setRunningStep(null); stopRequestedRef.current = false; return; }
              localOutputs['generate'] = { tests: allTests.slice(0, i + 1) };
              setStepOutputs({ ...localOutputs });
              updateStep('generate', `Generating test ${i + 1}/${allTests.length}...`);
              await new Promise(r => setTimeout(r, 200));
            }
            localOutputs['generate'] = { tests: allTests };
            setStepOutputs({ ...localOutputs }); completeStep('generate'); updateStep('generate', `Generated ${allTests.length} test cases`);
            break;
          case 'script':
            const generateOutput = localOutputs['generate']; if (!generateOutput) throw new Error('Please run Generate step first');
            localOutputs['script'] = { scripts: generateOutput.tests.map(t => ({ description: t.description, script: t.script })) };
            setStepOutputs({ ...localOutputs }); completeStep('script'); updateStep('script', `${generateOutput.tests.length} scripts ready`);
            break;
          case 'run':
            const scriptOutput = localOutputs['script']; if (!scriptOutput) throw new Error('Please run Script step first');
            const scripts = scriptOutput.scripts;
            if (scripts.length > 0) {
              updateStep('run', 'Starting test execution...');
              // 预先设置一个空结果，触发 UI 更新
              localOutputs['run'] = { results: [] };
              setStepOutputs({ ...localOutputs });
              await new Promise(r => setTimeout(r, 100));

              const results = [];
              for (let j = 0; j < scripts.length; j++) {
                if (stopRequestedRef.current) { setLoading(false); setRunningStep(null); stopRequestedRef.current = false; return; }
                const test = scripts[j];
                setCurrentStep('run'); // 强制触发更新
                updateStep('run', `Running test ${j + 1}/${scripts.length}: ${test.description}`);
                try { const res = await runScript({ url, script: test.script, description: test.description }); results.push({ description: test.description, script: test.script, ...res.data }); }
                catch (err) { results.push({ description: test.description, script: test.script, passed: false, errorMessage: err.response?.data?.error || err.message, errorType: 'script' }); }
                // 每次运行完一个测试就更新 UI
                localOutputs['run'] = { results: [...results] };
                setStepOutputs({ ...localOutputs });
                // 强制刷新 UI
                setCurrentStep('run');
                await new Promise(r => setTimeout(r, 100));
              }
              completeStep('run');
              const passed = results.filter(r => r.passed).length, failed = results.filter(r => !r.passed).length;
              updateStep('run', `${passed} passed, ${failed} failed`);
            } else { localOutputs['run'] = { results: [] }; setStepOutputs({ ...localOutputs }); completeStep('run'); updateStep('run', 'No scripts to run'); }
            break;
          case 'analyze':
            const runOutput = localOutputs['run']; if (!runOutput) throw new Error('Please run Run step first');
            const results = runOutput.results;
            updateStep('analyze', 'Analyzing results with AI...');
            // 调用 AI 分析
            const analyzeRes = await analyzeResults({ results, url });
            const aiAnalysis = analyzeRes.data.analysis;
            if (analyzeRes.data.usage) {
              calculateTotalTokens({ analyze: analyzeRes.data.usage });
            }
            const passed = results.filter(r => r.passed).length, failed = results.filter(r => !r.passed).length, envErrors = results.filter(r => r.errorType === 'environment').length, scriptErrors = results.filter(r => r.errorType === 'script').length, bugs = results.filter(r => r.errorType === 'bug').length;
            localOutputs['analyze'] = { total: results.length, passed, failed, environmentErrors: envErrors, scriptErrors, bugs, details: results, aiAnalysis };
            setStepOutputs({ ...localOutputs }); completeStep('analyze'); updateStep('analyze', [passed > 0 && `${passed} passed`, failed > 0 && `${failed} failed`].filter(Boolean).join(' | ') || 'All passed!' + ' - View in Content');
            break;
        }
      }
    } catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setRunningStep(null); setLoading(false); stopRequestedRef.current = false; }
  };

  const reset = () => { setUrl(''); setInstruction(''); setCurrentStep('input'); setCompletedSteps([]); setStepData({}); setStepOutputs({}); setTotalTokens({ prompt: 0, completion: 0, total: 0 }); setError(null); setSelectedNode(null); setRunningStep(null); };

  const downloadPdf = async () => {
    const analyzeData = stepOutputs['analyze'];
    if (!analyzeData) return;
    try {
      const res = await generatePDF({ reportData: analyzeData, url });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = 'webtest-report.pdf';
      link.click();
    } catch (err) {
      setError('Failed to download PDF: ' + err.message);
    }
  };

  const buildTreeData = () => {
    const tree = [];
    tree.push({ type: 'folder', label: 'Input', path: '/input', children: [{ type: 'file', label: `URL: ${url || '(none)'}`, path: '/input/url' }] });
    if (stepOutputs['crawl']) { const c = stepOutputs['crawl']; tree.push({ type: 'folder', label: 'Step 1: Crawl', path: '/crawl', children: [{ type: 'file', label: `Page: ${c.pageInfo?.title || c.url}`, path: '/crawl/pageInfo', data: { type: 'json', content: c.pageInfo } }, { type: 'file', label: 'Accessibility Tree', path: '/crawl/tree', data: { type: 'json', content: c.tree } }, { type: 'file', label: 'Screenshot', path: '/crawl/screenshot', data: { type: 'screenshot', content: c.screenshot } }] }); }
    if (stepOutputs['generate']) { const g = stepOutputs['generate']; tree.push({ type: 'folder', label: 'Step 2: Generate Tests', path: '/generate', children: g.tests.map((t, i) => ({ type: 'file', label: `${i + 1}. ${sanitizeText(t.description)}`, path: `/generate/${i}`, data: { type: 'code', content: t.script } })) }); }
    if (stepOutputs['script']) { const s = stepOutputs['script']; tree.push({ type: 'folder', label: 'Step 3: Scripts', path: '/script', children: s.scripts.map((t, i) => ({ type: 'file', label: `${i + 1}. ${sanitizeText(t.description)}`, path: `/script/${i}`, data: { type: 'code', content: t.script } })) }); }
    if (stepOutputs['run']) { const r = stepOutputs['run']; tree.push({ type: 'folder', label: 'Step 4: Run Results', path: '/run', children: r.results.flatMap((result, idx) => { const items = [{ type: 'file', label: `${idx + 1}. ${sanitizeText(result.description)} ${result.passed ? '✓' : '✗'}`, path: `/run/${idx}`, status: result.passed ? 'passed' : 'failed', data: { type: 'json', content: { passed: result.passed, errorType: result.errorType, errorMessage: result.errorMessage } } }]; if (result.screenshot) items.push({ type: 'file', label: '📷 Screenshot', path: `/run/${idx}/screenshot`, data: { type: 'screenshot', content: result.screenshot } }); return items; }) }); }
    if (stepOutputs['analyze']) { const a = stepOutputs['analyze']; tree.push({ type: 'folder', label: 'Step 5: Report', path: '/analyze', children: [{ type: 'file', label: `Summary: ${a.passed} passed, ${a.failed} failed`, path: '/analyze/summary', data: a.aiAnalysis ? { type: 'analysis', content: a } : { type: 'json', content: { total: a.total, passed: a.passed, failed: a.failed, environmentErrors: a.environmentErrors, scriptErrors: a.scriptErrors, bugs: a.bugs } } }] }); }
    return tree;
  };

  const getSelectedContent = () => {
    if (!selectedNode) return null;
    const parts = selectedNode.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const step = parts[0], output = stepOutputs[step];
    if (!output) return null;
    if (step === 'crawl') { if (parts[1] === 'tree') return { type: 'json', content: output.tree }; if (parts[1] === 'screenshot') return { type: 'screenshot', content: output.screenshot }; if (parts[1] === 'pageInfo') return { type: 'json', content: output.pageInfo }; }
    if (step === 'generate' || step === 'script') { const idx = parseInt(parts[1]); const items = step === 'generate' ? output.tests : output.scripts; if (items?.[idx]) return { type: 'code', content: step === 'generate' ? items[idx].description : items[idx].script }; }
    if (step === 'run') { const idx = parseInt(parts[1]); if (parts[2] === 'screenshot') return output.results?.[idx]?.screenshot ? { type: 'screenshot', content: output.results[idx].screenshot } : null; if (output.results?.[idx]) return { type: 'json', content: { description: output.results[idx].description, passed: output.results[idx].passed, errorType: output.results[idx].errorType, errorMessage: output.results[idx].errorMessage } }; }
    if (step === 'analyze') {
      // 如果有 AI 分析，返回特殊类型
      if (output.aiAnalysis) {
        return { type: 'analysis', content: output };
      }
      // 否则返回 JSON 格式
      return { type: 'json', content: { total: output.total, passed: output.passed, failed: output.failed, environmentErrors: output.environmentErrors, scriptErrors: output.scriptErrors, bugs: output.bugs } };
    }
    return null;
  };

  const treeData = buildTreeData();
  const circumference = 2 * Math.PI * 40;
  const progress = Math.min((totalTokens.total / 50000) * circumference, circumference);

  return (
    <div className="main-content" style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div className="card mb-6">
        <div style={{ padding: '1.5rem' }}>
          <div className="flex gap-6" style={{ display: 'flex', gap: '1.5rem' }}>
            <div className="flex-1" style={{ flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 200px', gap: '1rem', marginBottom: '1rem', alignItems: 'start' }}>
                <div className="form-group">
                  <label>URL</label>
                  <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="http://localhost:3001/demo-shop.html" disabled={loading} style={{ height: '3.5rem' }} />
                </div>
                <div className="form-group">
                  <label>What to test</label>
                  <textarea value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="Describe what you want to test in natural language&#10;e.g., Test the login flow" disabled={loading} style={{ height: '3.5rem', resize: 'none', borderRadius: '0.375rem' }} />
                </div>
                {/* Token Gauge */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '3.5rem', justifyContent: 'flex-start' }}>
                  <label style={{ marginBottom: '0.25rem' }}>AI Tokens</label>
                  <div className={`token-gauge-compact ${loading ? 'active' : ''}`}>
                    <div className="gauge-ring-compact">
                      <svg viewBox="0 0 100 100">
                        <defs>
                          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#7c3aed" />
                            <stop offset="100%" stopColor="#6366f1" />
                          </linearGradient>
                          <linearGradient id="gaugeGradientActive" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#f59e0b" />
                            <stop offset="100%" stopColor="#ef4444" />
                          </linearGradient>
                        </defs>
                        {/* Tick marks - left (0) and right (50K) */}
                        <line x1="8" y1="50" x2="12" y2="50" stroke="#94a3b8" strokeWidth="2" />
                        <line x1="88" y1="50" x2="92" y2="50" stroke="#94a3b8" strokeWidth="2" />
                        {/* Tick labels */}
                        <text x="6" y="52" textAnchor="middle" fontSize="6" fill="#94a3b8">50K</text>
                        <text x="94" y="52" textAnchor="middle" fontSize="6" fill="#94a3b8">0</text>
                        <circle cx="50" cy="50" r="40" className="bg" />
                        <circle cx="50" cy="50" r="40" className={`progress ${loading ? 'active' : ''}`} strokeDasharray={`${progress} ${circumference}`} strokeDashoffset={circumference * 0.25} />
                        {/* Needle - points to current position */}
                        <line
                          x1="50" y1="40"
                          x2="50" y2="14"
                          stroke={loading ? '#f59e0b' : '#6366f1'}
                          strokeWidth="3"
                          strokeLinecap="round"
                          style={{
                            transformOrigin: '50px 50px',
                            transform: `rotate(${Math.min(totalTokens.total / 50000 * 270, 270)}deg)`,
                            transition: 'transform 0.5s ease',
                            animation: loading ? 'needlePulse 1s ease-in-out infinite' : 'none'
                          }}
                        />
                        {/* Center dot */}
                        <circle cx="50" cy="50" r="4" fill={loading ? '#f59e0b' : '#6366f1'} />
                      </svg>
                      <div className="gauge-value">{totalTokens.total.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3" style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-primary" onClick={() => runFromStep('crawl')} disabled={loading || !url}>{loading ? 'Running...' : 'Run'}</button>
                <button className="btn btn-secondary" onClick={() => { setStopRequested(true); stopRequestedRef.current = true; }} disabled={!loading}>Stop</button>
                <button className="btn btn-ghost" onClick={reset} disabled={loading}>Reset</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && <div className="error-alert"><span className="error-icon">!</span><span>{error}</span></div>}

      {/* Workflow - Horizontal */}
      <div className="card">
        <div className="card-header"><h3 className="card-title">⚡ Workflow</h3></div>
        <div className="card-content">
          <div className="workflow-horizontal">
            {WORKFLOW_STEPS.map((step, idx) => {
              const completed = completedSteps.includes(step.id), current = currentStep === step.id, running = runningStep === step.id, pending = !completed && !current && !running;
              return (
                <div key={step.id} className={`workflow-item ${completed ? 'completed' : ''} ${running ? 'running' : ''} ${current ? 'current' : ''} ${pending ? 'pending' : ''}`}>
                  <div className={`workflow-item-icon ${running ? 'running' : ''}`} style={{ position: 'relative' }}>{completed ? '✓' : running ? '◌' : idx + 1}</div>
                  <div className={`workflow-item-label ${current || running ? 'active' : ''}`}>{step.label}</div>
                  {stepData[step.id] && <div className="workflow-item-desc">{stepData[step.id]}</div>}
                  {stepOutputs[step.id] && !running && <div className="workflow-item-rerun" onClick={() => runFromStep(step.id)}>Click to re-run</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Two Columns: Explorer + Content */}
      <div className="grid grid-cols-2 gap-6">
        {/* Explorer */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">📁 Explorer</h3></div>
          <div className="card-content">
            {treeData.length > 0 ? treeData.map((node, idx) => <TreeNode key={idx} node={{ ...node, path: node.path }} onSelect={setSelectedNode} selectedPath={selectedNode} />) : <div className="empty-state">Enter a URL and run the workflow</div>}
          </div>
        </div>

        {/* Content */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">📄 Content</h3></div>
          <div className="card-content"><ContentViewer data={getSelectedContent()} onDownloadPdf={stepOutputs['analyze'] ? downloadPdf : null} /></div>
        </div>
      </div>

    </div>
  );
}

export default MiniTest;
