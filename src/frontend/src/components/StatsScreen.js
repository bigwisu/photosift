import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './StatsScreen.css';

function StatsScreen({ stats }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const limit = 50;

  useEffect(() => {
    fetchFiles();
  }, [page]);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/files?limit=${limit}&offset=${page * limit}`);
      setFiles(response.data);
    } catch (error) {
      console.error('Error fetching files:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getDateSourceIcon = (source) => {
    const icons = {
      'exif': '📷',
      'filename_whatsapp': '💬',
      'filename_screenshot': '📸',
      'filename_google pixel': '📱',
      'filename_android': '🤖',
      'mtime': '📅',
      'current': '🕐'
    };
    return icons[source.toLowerCase()] || '📄';
  };

  return (
    <div className="stats-screen">
      <div className="stats-card">
        <h2>📊 Statistics & Files</h2>

        {stats && (
          <div className="stats-overview">
            <div className="stat-card">
              <div className="stat-icon">📁</div>
              <div className="stat-content">
                <div className="stat-value">{stats.totalFiles.toLocaleString()}</div>
                <div className="stat-label">Total Files</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">✨</div>
              <div className="stat-content">
                <div className="stat-value">{stats.uniqueFiles.toLocaleString()}</div>
                <div className="stat-label">Unique Files</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">🔄</div>
              <div className="stat-content">
                <div className="stat-value">{stats.duplicates.toLocaleString()}</div>
                <div className="stat-label">Duplicates</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">💾</div>
              <div className="stat-content">
                <div className="stat-value">{formatBytes(stats.totalSize)}</div>
                <div className="stat-label">Total Size</div>
              </div>
            </div>
          </div>
        )}

        <div className="files-section">
          <h3>Recent Files</h3>
          
          {loading ? (
            <div className="loading">Loading files...</div>
          ) : files.length === 0 ? (
            <div className="no-files">No files indexed yet</div>
          ) : (
            <>
              <div className="files-table">
                <div className="table-header">
                  <div className="col-filename">Filename</div>
                  <div className="col-date">Date</div>
                  <div className="col-source">Source</div>
                  <div className="col-size">Size</div>
                </div>
                <div className="table-body">
                  {files.map((file, index) => (
                    <div key={index} className="table-row">
                      <div className="col-filename" title={file.original_filename}>
                        {file.original_filename}
                      </div>
                      <div className="col-date">
                        {formatDate(file.extracted_date)}
                      </div>
                      <div className="col-source">
                        <span className="source-badge">
                          {getDateSourceIcon(file.date_source)} {file.date_source}
                        </span>
                      </div>
                      <div className="col-size">
                        {formatBytes(file.file_size)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pagination">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="pagination-button"
                >
                  ← Previous
                </button>
                <span className="page-info">Page {page + 1}</span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={files.length < limit}
                  className="pagination-button"
                >
                  Next →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default StatsScreen;

// Made with Bob
