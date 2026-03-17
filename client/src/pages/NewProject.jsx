import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createProject } from '../services/api';

function NewProject() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    const urls = urlInput.split('\n').map(u => u.trim()).filter(u => u);

    if (urls.length === 0) {
      setError('At least one URL is required');
      return;
    }

    setLoading(true);

    try {
      const res = await createProject({ name, urls });
      navigate(`/project/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="new-project">
      <h1>Create New Project</h1>
      <form onSubmit={handleSubmit} className="form">
        {error && <div className="error-message">{error}</div>}

        <div className="form-group">
          <label>Project Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter project name"
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label>Test URLs (one per line)</label>
          <textarea
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="https://example.com&#10;https://example.com/about"
            rows={6}
            disabled={loading}
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default NewProject;
