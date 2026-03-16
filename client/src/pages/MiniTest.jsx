import { useState, useRef } from 'react';
import { crawlUrl, generateTestCases, runScript } from '../services/api';

// Workflow steps definition
const WORKFLOW_STEPS = [
  { id: 'input', label: 'Input URL', description: 'Enter the URL to test' },
  { id: 'crawl', label: 'Crawl Page', description: 'Collect accessibility tree' },
  { id: 'generate', label: 'Generate Tests', description: 'Create test cases with AI' },
  { id: 'script', label: 'Generate Scripts', description: 'Create Playwright scripts' },
  { id: 'run', label: 'Run Tests', description: 'Execute automation scripts' },
  { id: 'analyze', label: 'Analyze Results', description: 'Analyze and classify results' }
];

// Tree node component
function TreeNode({ node, level = 0, defaultExpanded = true, onSelect, selectedPath }) {
  const [expanded, setExpanded] = useState(defaultExpanded && level < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedPath === node.path;

  const handleClick = () => {
    if (hasChildren) {
      setExpanded(!expanded);
    }
    // If it's a file node with data, trigger selection
    if (!hasChildren && node.data && onSelect) {
      onSelect(node.path);
    }
  };

  return (
    <div className="tree-node" style={{ marginLeft: level * 16 }}>
      <div
        className={`tree-node-header ${isSelected ? 'selected' : ''}`}
        onClick={handleClick}
      >
        {hasChildren ? (
          <span className="tree-toggle">{expanded ? '▼' : '▶'}</span>
        ) : (
          <span className="tree-toggle-spacer">●</span>
        )}
        <span className="tree-icon">{node.type === 'folder' ? '📁' : '📄'}</span>
        <span className="tree-label">{node.label}</span>
        {node.count !== undefined && <span className="tree-count">({node.count})</span>}
        {node.status && (
          <span className={`tree-status ${node.status}`}>
            {node.status === 'passed' ? '✓' : node.status === 'failed' ? '✗' : '○'}
          </span>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="tree-node-children">
          {node.children.map((child, idx) => (
            <TreeNode
              key={idx}
              node={{
                ...child,
                path: child.path || ((node.path || '') + '/' + idx)
              }}
              level={level + 1}
              defaultExpanded={defaultExpanded}
              onSelect={onSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Content viewer component
function ContentViewer({ data }) {
  if (!data) {
    return <div className="content-viewer-empty">Select a node to view its content</div>;
  }

  // Render based on content type
  if (data.type === 'screenshot' && data.content) {
    return (
      <div className="content-viewer-screenshot">
        <img src={`data:image/png;base64,${data.content}`} alt="Screenshot" />
      </div>
    );
  }

  if (data.type === 'code' && data.content) {
    return (
      <div className="content-viewer-code">
        <pre>{data.content}</pre>
      </div>
    );
  }

  if (data.type === 'json' && data.content) {
    return (
      <div className="content-viewer-json">
        <pre>{JSON.stringify(data.content, null, 2)}</pre>
      </div>
    );
  }

  return <div className="content-viewer-empty">No content to display</div>;
}

function MiniTest() {
  const [url, setUrl] = useState('http://localhost:3001/demo-shop.html');
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [runningStep, setRunningStep] = useState(null);
  const [stopRequested, setStopRequested] = useState(false);
  const stopRequestedRef = useRef(false);

  // Workflow state
  const [currentStep, setCurrentStep] = useState('input');
  const [completedSteps, setCompletedSteps] = useState([]);
  const [stepData, setStepData] = useState({});

  // Data states - each step stores its output
  const [stepOutputs, setStepOutputs] = useState({});
  const [tokenUsage, setTokenUsage] = useState({});
  const [totalTokens, setTotalTokens] = useState({ prompt: 0, completion: 0, total: 0 });

  // UI state
  const [selectedNode, setSelectedNode] = useState(null);

  // Error state
  const [error, setError] = useState(null);

  // Calculate total tokens from all steps
  const calculateTotalTokens = (usage) => {
    let prompt = 0, completion = 0;
    Object.values(usage).forEach(u => {
      if (u) {
        prompt += u.prompt_tokens || 0;
        completion += u.completion_tokens || 0;
      }
    });
    setTotalTokens({
      prompt,
      completion,
      total: prompt + completion
    });
  };

  const updateStep = (step, data = null) => {
    setCurrentStep(step);
    if (data) {
      setStepData(prev => ({ ...prev, [step]: data }));
    }
  };

  const completeStep = (step) => {
    if (!completedSteps.includes(step)) {
      setCompletedSteps(prev => [...prev, step]);
    }
  };

  const saveStepOutput = (step, output) => {
    setStepOutputs(prev => ({ ...prev, [step]: output }));
  };

  // Run a specific step and all subsequent steps
  const runFromStep = async (fromStepId) => {
    if (!url) {
      setError('Please enter a URL');
      return;
    }

    const stepIndex = WORKFLOW_STEPS.findIndex(s => s.id === fromStepId);
    if (stepIndex === -1) return;

    // Clear outputs for the step and all subsequent steps
    const stepsToClear = WORKFLOW_STEPS.slice(stepIndex).map(s => s.id);

    // Use a local variable to track outputs during execution
    let localOutputs = { ...stepOutputs };

    // Clear subsequent step outputs
    stepsToClear.forEach(stepId => {
      delete localOutputs[stepId];
    });

    // Reset completed steps to only include steps before the starting point
    const stepsToKeep = WORKFLOW_STEPS.slice(0, stepIndex).map(s => s.id);

    setStepOutputs(localOutputs);
    setCompletedSteps(stepsToKeep);
    setSelectedNode(null);
    setLoading(true);
    setError(null);
    stopRequestedRef.current = false;

    try {
      // Run each step from the starting point
      for (let i = stepIndex; i < WORKFLOW_STEPS.length; i++) {
        // Check if stop was requested
        if (stopRequestedRef.current) {
          setLoading(false);
          setRunningStep(null);
          setStopRequested(false);
          stopRequestedRef.current = false;
          return;
        }

        const step = WORKFLOW_STEPS[i];
        setRunningStep(step.id);
        setCurrentStep(step.id);

        switch (step.id) {
          case 'crawl': {
            updateStep('crawl', 'Loading page...');
            const crawlRes = await crawlUrl({ url, waitFor: 3000 });

            // Check if crawl was successful
            if (!crawlRes.data.simplifiedTree || !crawlRes.data.simplifiedTree.children || crawlRes.data.simplifiedTree.children.length === 0) {
              throw new Error('Failed to crawl page: page returned error or is empty');
            }

            const output = {
              url: crawlRes.data.url,
              pageInfo: crawlRes.data.pageInfo,
              tree: crawlRes.data.simplifiedTree,
              screenshot: crawlRes.data.screenshot,
              crawledAt: crawlRes.data.crawledAt
            };
            localOutputs['crawl'] = output;
            setStepOutputs({ ...localOutputs });
            completeStep('crawl');
            updateStep('crawl', `Page: ${crawlRes.data.pageInfo?.title || url}`);
            break;
          }

          case 'generate': {
            const crawlOutput = localOutputs['crawl'];
            if (!crawlOutput) {
              throw new Error('Please run Crawl step first');
            }
            // Check if crawl output is valid
            if (!crawlOutput.tree || !crawlOutput.tree.children || crawlOutput.tree.children.length === 0) {
              throw new Error('Crawl step failed: no tree data. Please fix the crawl issue first.');
            }

            updateStep('generate', 'Analyzing page structure...');
            const generateRes = await generateTestCases({ url, instruction });
            const tests = generateRes.data.tests || [];

            if (tests.length === 0) {
              throw new Error('Failed to generate test cases');
            }

            const usage = generateRes.data.usage;

            // Save token usage
            setTokenUsage(prev => {
              const newUsage = { ...prev, generate: usage };
              calculateTotalTokens(newUsage);
              return newUsage;
            });

            localOutputs['generate'] = { tests };
            setStepOutputs({ ...localOutputs });
            completeStep('generate');
            updateStep('generate', `Generated ${tests.length} test cases`);
            break;
          }

          case 'script': {
            const generateOutput = localOutputs['generate'];
            if (!generateOutput) {
              throw new Error('Please run Generate step first');
            }
            const tests = generateOutput.tests;
            localOutputs['script'] = { scripts: tests.map(t => ({ description: t.description, script: t.script })) };
            setStepOutputs({ ...localOutputs });
            completeStep('script');
            updateStep('script', `${tests.length} scripts ready`);
            break;
          }

          case 'run': {
            const scriptOutput = localOutputs['script'];
            if (!scriptOutput) {
              throw new Error('Please run Script step first');
            }
            const scripts = scriptOutput.scripts;
            if (scripts.length > 0) {
              updateStep('run', 'Starting test execution...');
              const results = [];

              for (let j = 0; j < scripts.length; j++) {
                // Check if stop was requested
                if (stopRequestedRef.current) {
                  setLoading(false);
                  setRunningStep(null);
                  setStopRequested(false);
          stopRequestedRef.current = false;
                  return;
                }

                const test = scripts[j];
                updateStep('run', `Running test ${j + 1}/${scripts.length}: ${test.description}`);

                try {
                  const res = await runScript({
                    url,
                    script: test.script,
                    description: test.description
                  });
                  results.push({
                    description: test.description,
                    script: test.script,
                    ...res.data
                  });
                } catch (err) {
                  results.push({
                    description: test.description,
                    script: test.script,
                    passed: false,
                    errorMessage: err.response?.data?.error || err.message,
                    errorType: 'script'
                  });
                }
              }

              localOutputs['run'] = { results };
              setStepOutputs({ ...localOutputs });
              completeStep('run');
              const passed = results.filter(r => r.passed).length;
              const failed = results.filter(r => !r.passed).length;
              updateStep('run', `${passed} passed, ${failed} failed`);
            } else {
              localOutputs['run'] = { results: [] };
              setStepOutputs({ ...localOutputs });
              completeStep('run');
              updateStep('run', 'No scripts to run');
            }
            break;
          }

          case 'analyze': {
            const runOutput = localOutputs['run'];
            if (!runOutput) {
              throw new Error('Please run Run step first');
            }
            const results = runOutput.results;
            const passed = results.filter(r => r.passed).length;
            const failed = results.filter(r => !r.passed).length;
            const envErrors = results.filter(r => r.errorType === 'environment').length;
            const scriptErrors = results.filter(r => r.errorType === 'script').length;
            const bugs = results.filter(r => r.errorType === 'bug').length;

            const summary = {
              total: results.length,
              passed,
              failed,
              environmentErrors: envErrors,
              scriptErrors,
              bugs,
              details: results
            };

            localOutputs['analyze'] = summary;
            setStepOutputs({ ...localOutputs });
            completeStep('analyze');
            const analysisSummary = [
              passed > 0 && `${passed} passed`,
              failed > 0 && `${failed} failed`,
              envErrors > 0 && `${envErrors} env`,
              scriptErrors > 0 && `${scriptErrors} script`,
              bugs > 0 && `${bugs} bugs`
            ].filter(Boolean).join(' | ');
            updateStep('analyze', analysisSummary || 'All passed!');
            break;
          }
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setRunningStep(null);
      setLoading(false);
      setStopRequested(false);
          stopRequestedRef.current = false;
    }
  };

  const reset = () => {
    setUrl('');
    setInstruction('');
    setCurrentStep('input');
    setCompletedSteps([]);
    setStepData({});
    setStepOutputs({});
    setTokenUsage({});
    setTotalTokens({ prompt: 0, completion: 0, total: 0 });
    setError(null);
    setSelectedNode(null);
    setRunningStep(null);
  };

  // Build tree data from step outputs
  const buildTreeData = () => {
    const tree = [];

    // Input folder
    tree.push({
      type: 'folder',
      label: 'Input',
      path: '/input',
      children: [
        { type: 'file', label: `URL: ${url || '(none)'}`, path: '/input/url' }
      ]
    });

    // Crawl output
    if (stepOutputs['crawl']) {
      const crawl = stepOutputs['crawl'];
      tree.push({
        type: 'folder',
        label: 'Step 1: Crawl',
        path: '/crawl',
        children: [
          { type: 'file', label: `Page: ${crawl.pageInfo?.title || crawl.url}`, path: '/crawl/pageInfo' },
          { type: 'file', label: 'Accessibility Tree', path: '/crawl/tree', data: { type: 'json', content: crawl.tree } },
          { type: 'file', label: 'Screenshot', path: '/crawl/screenshot', data: { type: 'screenshot', content: crawl.screenshot } }
        ]
      });
    }

    // Generate output
    if (stepOutputs['generate']) {
      const generate = stepOutputs['generate'];
      tree.push({
        type: 'folder',
        label: 'Step 2: Generate Tests',
        path: '/generate',
        children: generate.tests.map((test, idx) => ({
          type: 'file',
          label: `${idx + 1}. ${test.description}`,
          path: `/generate/${idx}`,
          data: { type: 'code', content: test.script }
        }))
      });
    }

    // Script output
    if (stepOutputs['script']) {
      const script = stepOutputs['script'];
      tree.push({
        type: 'folder',
        label: 'Step 3: Scripts',
        path: '/script',
        children: script.scripts.map((s, idx) => ({
          type: 'file',
          label: `${idx + 1}. ${s.description}`,
          path: `/script/${idx}`,
          data: { type: 'code', content: s.script }
        }))
      });
    }

    // Run output
    if (stepOutputs['run']) {
      const run = stepOutputs['run'];
      tree.push({
        type: 'folder',
        label: 'Step 4: Run Results',
        path: '/run',
        children: run.results.flatMap((result, idx) => {
          const items = [
            {
              type: 'file',
              label: `${idx + 1}. ${result.description} ${result.passed ? '✓' : '✗'}`,
              path: `/run/${idx}`,
              status: result.passed ? 'passed' : 'failed',
              data: {
                type: 'json',
                content: {
                  passed: result.passed,
                  errorType: result.errorType,
                  errorMessage: result.errorMessage
                }
              }
            }
          ];
          // Add screenshot as separate item if available
          if (result.screenshot) {
            items.push({
              type: 'file',
              label: `   📷 Screenshot`,
              path: `/run/${idx}/screenshot`,
              data: {
                type: 'screenshot',
                content: result.screenshot
              }
            });
          }
          return items;
        })
      });
    }

    // Analyze output
    if (stepOutputs['analyze']) {
      const analyze = stepOutputs['analyze'];
      tree.push({
        type: 'folder',
        label: 'Step 5: Analyze',
        path: '/analyze',
        children: [
          { type: 'file', label: `Summary: ${analyze.passed} passed, ${analyze.failed} failed`, path: '/analyze/summary' }
        ]
      });
    }

    return tree;
  };

  const treeData = buildTreeData();

  // Find selected node data
  const getSelectedContent = () => {
    if (!selectedNode) return null;

    // Parse path and find data
    const parts = selectedNode.split('/').filter(Boolean);
    if (parts.length < 2) return null;

    const step = parts[0];
    const output = stepOutputs[step];
    if (!output) return null;

    // Navigate to the specific data
    if (step === 'crawl') {
      if (parts[1] === 'tree') return { type: 'json', content: output.tree };
      if (parts[1] === 'screenshot') return { type: 'screenshot', content: output.screenshot };
      if (parts[1] === 'pageInfo') return { type: 'json', content: output.pageInfo };
    }

    if (step === 'generate' || step === 'script') {
      const idx = parseInt(parts[1]);
      const items = step === 'generate' ? output.tests : output.scripts;
      if (items && items[idx]) {
        // generate step: show description; script step: show code
        const content = step === 'generate' ? items[idx].description : items[idx].script;
        return { type: 'code', content };
      }
    }

    if (step === 'run') {
      const idx = parseInt(parts[1]);
      // Check if it's a screenshot request
      if (parts[2] === 'screenshot') {
        if (output.results && output.results[idx] && output.results[idx].screenshot) {
          return {
            type: 'screenshot',
            content: output.results[idx].screenshot
          };
        }
        return null;
      }
      // Otherwise return the test result info
      if (output.results && output.results[idx]) {
        const result = output.results[idx];
        return {
          type: 'json',
          content: {
            description: result.description,
            passed: result.passed,
            errorType: result.errorType,
            errorMessage: result.errorMessage,
            hasScreenshot: !!result.screenshot
          }
        };
      }
    }

    if (step === 'analyze') {
      return { type: 'json', content: output };
    }

    return null;
  };

  return (
    <div className="mini-test">
      {/* First Row: Input */}
      <div className="input-section">
        <div className="form-row">
          <div className="form-group flex-2">
            <label>URL to test:</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="http://localhost:3001/demo-shop.html"
              disabled={loading}
            />
          </div>
          <div className="form-group flex-3">
            <label>What to test (optional):</label>
            <input
              type="text"
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder="e.g., Test login, Test shopping cart, Test checkout"
              disabled={loading}
            />
          </div>
          {/* Token Gauge - Simple Style */}
          <div className={`token-gauge ${loading ? 'active' : ''}`}>
            <div className="gauge-container">
              <svg viewBox="0 0 100 60" className="gauge-svg">
                {/* Background arc */}
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
                {/* Progress arc */}
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  stroke={loading ? '#f59e0b' : '#3b82f6'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.min((totalTokens.total / 50000) * 126, 126)} 126`}
                  className="gauge-progress"
                />
              </svg>
              <div
                className="gauge-needle"
                style={{ transform: `translateX(-50%) rotate(${Math.min((totalTokens.total / 50000) * 180 - 90, 90)}deg)` }}
              ></div>
              <div className="gauge-needle-center"></div>
            </div>
            <div className="gauge-info">
              <span className="gauge-value">{totalTokens.total.toLocaleString()}</span>
              <span className="gauge-label">AI Tokens</span>
            </div>
          </div>
        </div>
        <div className="button-group">
          <button
            className="btn btn-primary btn-large"
            onClick={() => runFromStep('crawl')}
            disabled={loading || !url}
          >
            {loading ? 'Running...' : '🚀 Run Full Workflow'}
          </button>
          <button
            className="btn btn-stop"
            onClick={() => {
                setStopRequested(true);
                stopRequestedRef.current = true;
              }}
            disabled={!loading}
          >
            Stop
          </button>
          <button className="btn btn-outline" onClick={reset} disabled={loading}>
            Reset
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Second Row: Left (Workflow) + Right (Explorer + Content) */}
      <div className="workspace-row-multi">
        {/* Left: Vertical Workflow */}
        <div className="workflow-panel">
          <h3>Workflow</h3>
          <div className="workflow-vertical">
            {WORKFLOW_STEPS.map((step, index) => {
              const isCompleted = completedSteps.includes(step.id);
              const isCurrent = currentStep === step.id;
              const isRunning = runningStep === step.id;
              const isPending = !isCompleted && !isCurrent && !isRunning;

              return (
                <div
                  key={step.id}
                  className={`workflow-step-vertical ${isCompleted ? 'completed' : ''} ${isCurrent || isRunning ? 'current' : ''} ${isPending ? 'pending' : ''}`}
                  onClick={() => !isPending && stepOutputs[step.id] && runFromStep(step.id)}
                  style={{ cursor: isPending ? 'default' : 'pointer' }}
                >
                  <div className="step-connector-vertical">
                    <div className="step-circle-vertical">
                      {isCompleted ? (
                        <span className="checkmark">✓</span>
                      ) : isRunning ? (
                        <span className="spinner">◌</span>
                      ) : (
                        <span className="step-number">{index + 1}</span>
                      )}
                    </div>
                    {index < WORKFLOW_STEPS.length - 1 && (
                      <div className={`connector-line-vertical ${isCompleted ? 'completed' : ''}`} />
                    )}
                  </div>
                  <div className="step-content-vertical">
                    <div className="step-label-vertical">{step.label}</div>
                    {stepData[step.id] && (
                      <div className="step-data-vertical">{stepData[step.id]}</div>
                    )}
                    {stepOutputs[step.id] && !isRunning && (
                      <div className="step-action-vertical">Click to re-run →</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Middle: File Tree */}
        <div className="tree-panel">
          <h3>Explorer</h3>
          {treeData.length > 0 ? (
            <div className="tree-view-panel">
              {treeData.map((node, idx) => (
                <TreeNode
                  key={idx}
                  node={{ ...node, path: node.path }}
                  onSelect={setSelectedNode}
                  selectedPath={selectedNode}
                />
              ))}
            </div>
          ) : (
            <div className="empty-tree">
              Enter a URL and run the workflow to see outputs.
            </div>
          )}
        </div>

        {/* Right: Content Viewer */}
        <div className="content-panel">
          <h3>Content</h3>
          <ContentViewer data={getSelectedContent()} />
        </div>
      </div>

      {/* Results Summary */}
      {stepOutputs['run'] && (
        <div className="result-section">
          <h3>Test Results Summary</h3>
          <div className="results-summary">
            <div className="summary-item passed">
              <span className="summary-value">{stepOutputs['run'].results.filter(r => r.passed).length}</span>
              <span className="summary-label">Passed</span>
            </div>
            <div className="summary-item failed">
              <span className="summary-value">{stepOutputs['run'].results.filter(r => !r.passed).length}</span>
              <span className="summary-label">Failed</span>
            </div>
            <div className="summary-item environment">
              <span className="summary-value">{stepOutputs['run'].results.filter(r => r.errorType === 'environment').length}</span>
              <span className="summary-label">Environment</span>
            </div>
            <div className="summary-item script">
              <span className="summary-value">{stepOutputs['run'].results.filter(r => r.errorType === 'script').length}</span>
              <span className="summary-label">Script Error</span>
            </div>
            <div className="summary-item bug">
              <span className="summary-value">{stepOutputs['run'].results.filter(r => r.errorType === 'bug').length}</span>
              <span className="summary-label">Bugs</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MiniTest;
