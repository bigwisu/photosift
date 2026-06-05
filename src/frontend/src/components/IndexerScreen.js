import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './IndexerScreen.css';

function IndexerScreen({ onIndexComplete }) {
  const [status, setStatus] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [throttle, setThrottle] = useState(500);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStatus();
    fetchJobs();
    const interval = setInterval(() => {
      fetchStatus();
      fetchJobs();
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await axios.get('/api/indexer/status');
      setStatus(response.data);
    } catch (error) {
      console.error('Error fetching status:', error);
    }
  };

  const fetchJobs = async () => {
    try {
      const response = await axios.get('/api/indexer/jobs?limit=10');
      setJobs(response.data);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      await axios.post('/api/indexer/start');
      fetchStatus();
      fetchJobs();
    } catch (error) {
      console.error('Error starting indexer:', error);
      alert(error.response?.data?.error || 'Failed to start indexer');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await axios.post('/api/indexer/stop');
      fetchStatus();
    } catch (error) {
      console.error('Error stopping indexer:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleThrottleUpdate = async () => {
    try {
      await axios.put('/api/indexer/throttle', { throttleMs: throttle });
      alert('Throttle updated successfully');
    } catch (error) {
      console.error('Error updating throttle:', error);
      alert('Failed to update throttle');
    }
  };

  const isRunning = status?.running || false;
  const currentJob = status?.job;

  return (
    <div className="indexer-screen">
      <div className="indexer-card">
        <h2>🔍 Background Indexer</h2>
        <p className="description">
          Scan and index photos from the input directory. Duplicates will be moved to the duplicates folder.
        </p>

        <div className="status-section">
          <div className="status-header">
            <h3>Current Status</h3>
            <div className={`status-badge ${isRunning ? 'running' : 'idle'}`}>
              {isRunning ? '🟢 Running' : '⚪ Idle'}
            </div>
          </div>

          {currentJob && (
            <div className="current-job">
              <div className="job-info">
                <div className="job-stat">
                  <span className="job-label">Processed:</span>
                  <span className="job-value">
                    {currentJob.processed_files} / {currentJob.total_files || '?'}
                  </span>
                </div>
                <div className="job-stat">
                  <span className="job-label">Duplicates:</span>
                  <span className="job-value">{currentJob.duplicates_found}</span>
                </div>
              </div>
              {currentJob.processed_files > 0 && currentJob.total_files > 0 && (
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${(currentJob.processed_files / currentJob.total_files) * 100}%`
                    }}
                  />
                </div>
              )}
              {currentJob.last_processed_file && (
                <div className="last-file">
                  Last: {currentJob.last_processed_file.split('/').pop()}
                </div>
              )}
            </div>
          )}

          <div className="control-buttons">
            <button
              onClick={handleStart}
              disabled={isRunning || loading}
              className="control-button start"
            >
              {loading ? '⏳ Starting...' : '▶️ Start Indexing'}
            </button>
            <button
              onClick={handleStop}
              disabled={!isRunning || loading}
              className="control-button stop"
            >
              ⏹️ Stop
            </button>
          </div>
        </div>

        <div className="throttle-section">
          <h3>Throttle Settings</h3>
          <p className="throttle-description">
            Delay between processing files (milliseconds)
          </p>
          <div className="throttle-control">
            <input
              type="number"
              value={throttle}
              onChange={(e) => setThrottle(parseInt(e.target.value) || 0)}
              min="0"
              max="5000"
              step="100"
              className="throttle-input"
            />
            <button onClick={handleThrottleUpdate} className="throttle-button">
              Update
            </button>
          </div>
        </div>

        <div className="jobs-section">
          <h3>Recent Jobs</h3>
          {jobs.length === 0 ? (
            <div className="no-jobs">No indexing jobs yet</div>
          ) : (
            <div className="jobs-list">
              {jobs.map((job) => (
                <div key={job.id} className="job-item">
                  <div className="job-header">
                    <span className="job-id">Job #{job.id}</span>
                    <span className={`job-status ${job.status}`}>
                      {job.status}
                    </span>
                  </div>
                  <div className="job-details">
                    <div className="job-detail">
                      <span>📁 {job.folder_path}</span>
                    </div>
                    <div className="job-stats-row">
                      <span>📊 {job.processed_files}/{job.total_files} files</span>
                      <span>🔄 {job.duplicates_found} duplicates</span>
                    </div>
                    <div className="job-time">
                      Started: {new Date(job.started_at).toLocaleString()}
                    </div>
                    {job.completed_at && (
                      <div className="job-time">
                        Completed: {new Date(job.completed_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default IndexerScreen;

// Made with Bob
