import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getProjects, deleteProject } from '../services/api';

function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const res = await getProjects();
      setProjects(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this project?')) {
      try {
        await deleteProject(id);
        loadProjects();
      } catch (err) {
        console.error(err);
      }
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="dashboard">
      <h1>Projects</h1>
      {projects.length === 0 ? (
        <div className="empty-state">
          <p>No projects yet. Create a new project to get started.</p>
          <Link to="/new" className="btn btn-primary">Create Project</Link>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map(project => (
            <div key={project.id} className="project-card">
              <h3>{project.name}</h3>
              <p className="project-urls">{project.urls?.join(', ')}</p>
              <p className="project-date">Created: {new Date(project.createdAt).toLocaleDateString()}</p>
              <div className="project-actions">
                <Link to={`/project/${project.id}`} className="btn btn-primary">View</Link>
                <button onClick={() => handleDelete(project.id)} className="btn btn-danger">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
