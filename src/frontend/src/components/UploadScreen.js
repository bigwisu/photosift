import React, { useState } from 'react';
import axios from 'axios';
import './UploadScreen.css';

function UploadScreen({ onUploadComplete }) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files);
    setSelectedFiles(files);
    setUploadResults(null);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      setSelectedFiles(files);
      setUploadResults(null);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    setUploadResults(null);

    try {
      const formData = new FormData();
      
      if (selectedFiles.length === 1) {
        formData.append('file', selectedFiles[0]);
        const response = await axios.post('/api/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setUploadResults({
          total: 1,
          successful: response.data.success && !response.data.isDuplicate ? 1 : 0,
          duplicates: response.data.isDuplicate ? 1 : 0,
          failed: response.data.success ? 0 : 1,
          results: [response.data]
        });
      } else {
        selectedFiles.forEach(file => {
          formData.append('files', file);
        });
        const response = await axios.post('/api/upload/multiple', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setUploadResults(response.data);
      }

      onUploadComplete();
    } catch (error) {
      console.error('Upload error:', error);
      setUploadResults({
        total: selectedFiles.length,
        successful: 0,
        duplicates: 0,
        failed: selectedFiles.length,
        error: error.message
      });
    } finally {
      setUploading(false);
    }
  };

  const clearSelection = () => {
    setSelectedFiles([]);
    setUploadResults(null);
  };

  return (
    <div className="upload-screen">
      <div className="upload-card">
        <h2>📤 Upload Photos & Videos</h2>
        
        <div
          className={`drop-zone ${dragActive ? 'drag-active' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="drop-zone-content">
            <div className="upload-icon">📁</div>
            <p className="drop-text">Drag & drop files here</p>
            <p className="drop-subtext">or</p>
            <label className="file-input-label">
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={handleFileSelect}
                className="file-input"
              />
              <span className="file-input-button">Browse Files</span>
            </label>
          </div>
        </div>

        {selectedFiles.length > 0 && (
          <div className="selected-files">
            <div className="selected-header">
              <h3>Selected Files ({selectedFiles.length})</h3>
              <button onClick={clearSelection} className="clear-button">
                Clear
              </button>
            </div>
            <div className="file-list">
              {selectedFiles.slice(0, 10).map((file, index) => (
                <div key={index} className="file-item">
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{formatBytes(file.size)}</span>
                </div>
              ))}
              {selectedFiles.length > 10 && (
                <div className="file-item more">
                  <span>... and {selectedFiles.length - 10} more files</span>
                </div>
              )}
            </div>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="upload-button"
            >
              {uploading ? '⏳ Uploading...' : '🚀 Upload Files'}
            </button>
          </div>
        )}

        {uploadResults && (
          <div className="upload-results">
            <h3>Upload Results</h3>
            <div className="results-summary">
              <div className="result-stat success">
                <span className="result-label">✅ Successful</span>
                <span className="result-value">{uploadResults.successful}</span>
              </div>
              <div className="result-stat duplicate">
                <span className="result-label">🔄 Duplicates</span>
                <span className="result-value">{uploadResults.duplicates}</span>
              </div>
              <div className="result-stat failed">
                <span className="result-label">❌ Failed</span>
                <span className="result-value">{uploadResults.failed}</span>
              </div>
            </div>
            {uploadResults.error && (
              <div className="error-message">
                Error: {uploadResults.error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

export default UploadScreen;

// Made with Bob
