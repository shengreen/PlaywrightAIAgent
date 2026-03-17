import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 300000
});

// Projects
export const createProject = (data) => api.post('/projects', data);
export const getProjects = () => api.get('/projects');
export const getProject = (id) => api.get(`/projects/${id}`);
export const deleteProject = (id) => api.delete(`/projects/${id}`);

// Crawl
export const crawlUrl = (data) => api.post('/crawl', data);

// Generate
export const generateTestCases = (data) => api.post('/generate/testcases', data);
export const saveTests = (data) => api.post('/generate/save', data);
export const generateForProject = (projectId, data) => api.post(`/generate/project/${projectId}`, data);

// Test
export const runTest = (testCaseId) => api.post('/test/run', { testCaseId });
export const runScript = (data) => api.post('/test/run-script', data);
export const runProjectTests = (projectId) => {
  return new Promise((resolve, reject) => {
    const eventSource = new EventSource(`${API_BASE}/test/run-project/${projectId}`);
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'complete') {
        eventSource.close();
        resolve(data.report);
      }
    };
    eventSource.onerror = (error) => {
      eventSource.close();
      reject(error);
    };
  });
};
export const getTestCases = (projectId) => api.get(`/test/cases/${projectId}`);
export const getTestCase = (id) => api.get(`/test/case/${id}`);

// Reports
export const getReports = (projectId) => api.get(`/reports/project/${projectId}`);
export const getReport = (id) => api.get(`/reports/${id}`);
export const getLatestReport = (projectId) => api.get(`/reports/latest/${projectId}`);

// Analyze
export const analyzeResults = (data) => api.post('/test/analyze', data);

// PDF Report
export const generatePDF = (data) => api.post('/test/report-pdf', data, {
  responseType: 'blob'
});

export default api;
