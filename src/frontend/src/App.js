import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import UploadScreen from './components/UploadScreen';
import IndexerScreen from './components/IndexerScreen';
import StatsScreen from './components/StatsScreen';

function App() {
  const [activeTab, setActiveTab] = useState('upload');
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Refresh stats every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get('/api/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>📸 PhotoSift</h1>
        <p className="subtitle">NAS Photo Deduplicator</p>
      </header>

      <nav className="app-nav">
        <button
          className={`nav-button ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          📤 Upload
        </button>
        <button
          className={`nav-button ${activeTab === 'indexer' ? 'active' : ''}`}
          onClick={() => setActiveTab('indexer')}
        >
          🔍 Indexer
        </button>
        <button
          className={`nav-button ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          📊 Statistics
        </button>
      </nav>

      <main className="app-main">
        {activeTab === 'upload' && <UploadScreen onUploadComplete={fetchStats} />}
        {activeTab === 'indexer' && <IndexerScreen onIndexComplete={fetchStats} />}
        {activeTab === 'stats' && <StatsScreen stats={stats} />}
      </main>

      {stats && (
        <footer className="app-footer">
          <div className="footer-stat">
            <span className="stat-label">Total Files:</span>
            <span className="stat-value">{stats.totalFiles.toLocaleString()}</span>
          </div>
          <div className="footer-stat">
            <span className="stat-label">Unique:</span>
            <span className="stat-value">{stats.uniqueFiles.toLocaleString()}</span>
          </div>
          <div className="footer-stat">
            <span className="stat-label">Duplicates:</span>
            <span className="stat-value">{stats.duplicates.toLocaleString()}</span>
          </div>
          <div className="footer-stat">
            <span className="stat-label">Total Size:</span>
            <span className="stat-value">{formatBytes(stats.totalSize)}</span>
          </div>
        </footer>
      )}
    </div>
  );
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

export default App;

// Made with Bob
