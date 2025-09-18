import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import './Dashboard.css';
import logoImg from '../assets/img1.png';

function Dashboard({ user }) {
  const [showSQLDrawer, setShowSQLDrawer] = useState(false);
  // Drag/resize state for the movable SQL drawer
  const [dragEnabled, setDragEnabled] = useState(false); // toggled by double-click
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [drawerPos, setDrawerPos] = useState({ right: 0, top: 0 });
  const [drawerSize, setDrawerSize] = useState({ width: 480, height: window.innerHeight });
  const dragRef = useRef({ startX: 0, startY: 0, startRight: 0, startTop: 0, startWidth: 0, startHeight: 0 });
  // Chat drawer placeholder state
  const [chatMessages, setChatMessages] = useState([
    { sender: 'bot', text: 'Hi! I am your database assistant. Ask me anything about your data.' }
  ]);
  const [chatInput, setChatInput] = useState('');

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setChatMessages((msgs) => [
      ...msgs,
      { sender: 'user', text: chatInput }
    ]);
    setChatInput('');
    // Placeholder: echo back
    setTimeout(() => {
      setChatMessages((msgs) => [
        ...msgs,
        { sender: 'bot', text: 'This is a placeholder. LLM integration coming soon!' }
      ]);
    }, 700);
  };
  const focusChat = () => {
    const el = document.getElementById('mainChatInput');
    if (el) el.focus();
  };
  const [naturalLanguageInput, setNaturalLanguageInput] = useState('');
  const [generatedSQL, setGeneratedSQL] = useState('-- Your generated SQL will appear here\nSELECT * FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY);');
  const [queryResults, setQueryResults] = useState([]);
  const [explanation, setExplanation] = useState('Generate a SQL query to see the explanation here.');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('sql');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [dbConnection, setDbConnection] = useState(null);
  const [showDbModal, setShowDbModal] = useState(false);
  const [dbConfig, setDbConfig] = useState({
    connectionString: '',
    type: '',
    host: '',
    port: '',
    database: '',
    username: '',
    password: ''
  });
  const [estimatedRows, setEstimatedRows] = useState('--');
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    
    // Check for existing connections
    checkExistingConnections();
  }, [user, navigate]);

  useEffect(() => {
    // Add keyboard shortcuts
    const handleKeyboard = (e) => {
      // Ctrl+Enter to execute query
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        handleExecuteQuery();
      }
      
      // Ctrl+Shift+G to generate SQL
      if (e.ctrlKey && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        handleGenerateSQL();
      }
      
      // Escape to close modals
      if (e.key === 'Escape') {
        setShowDbModal(false);
      }
    };

    document.addEventListener('keydown', handleKeyboard);
    
    return () => {
      document.removeEventListener('keydown', handleKeyboard);
    };
  }, []);

  const checkExistingConnections = async () => {
    try {
      const response = await api.get('/api/database/connections');

      if (response.data.success && response.data.data?.connections?.length > 0) {
        const activeConnection = response.data.data.connections.find(conn => conn.status === 'connected');
        if (activeConnection) {
          setDbConnection(activeConnection);
          setConnectionStatus('connected');
        }
      }
    } catch (error) {
      console.error('Error checking connections:', error);
    }
  };

  const handleGenerateSQL = async () => {
    if (!naturalLanguageInput.trim()) {
      showNotification('Please enter a description of what you want to query', 'warning');
      return;
    }

    setLoading(true);
    try {
      // If no database connection, use demo mode
      if (!dbConnection) {
        const demoSQL = generateDemoSQL(naturalLanguageInput);
        setGeneratedSQL(demoSQL.sql);
        setExplanation(demoSQL.explanation);
        setEstimatedRows(demoSQL.estimatedRows);
        setActiveTab('sql');
        showNotification('Demo SQL generated! Connect a database for AI-powered generation.', 'info');
        setLoading(false);
        return;
      }

      const response = await api.post(`/api/database/connections/${dbConnection?.connectionId}/generate-sql`, {
        naturalLanguage: naturalLanguageInput
      });

      if (response.data.success) {
        setGeneratedSQL(response.data.data.sql);
        setExplanation(response.data.data.explanation || 'SQL query generated successfully.');
        setEstimatedRows(response.data.data.estimatedRows || '~' + Math.floor(Math.random() * 1000));
        setActiveTab('sql');
        showNotification('SQL query generated successfully!', 'success');
      }
    } catch (error) {
      console.error('Error generating SQL:', error);
      // Fallback to demo mode if backend fails
      const demoSQL = generateDemoSQL(naturalLanguageInput);
      setGeneratedSQL(demoSQL.sql);
      setExplanation(demoSQL.explanation);
      setEstimatedRows(demoSQL.estimatedRows);
      setActiveTab('sql');
      showNotification('Using demo mode - backend unavailable', 'warning');
    } finally {
      setLoading(false);
    }
  };

  const generateDemoSQL = (naturalLanguage) => {
    const input = naturalLanguage.toLowerCase();
    
    if (input.includes('users') && input.includes('month')) {
      return {
        sql: `SELECT u.id, u.name, u.email, u.created_at
FROM users u
WHERE u.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)
ORDER BY u.created_at DESC;`,
        explanation: 'This query retrieves all users who registered in the last month, ordered by registration date.',
        estimatedRows: '~150'
      };
    } else if (input.includes('inventory') || input.includes('stock')) {
      return {
        sql: `SELECT p.id, p.name, p.stock_quantity, p.reorder_level
FROM products p
WHERE p.stock_quantity <= p.reorder_level
ORDER BY p.stock_quantity ASC;`,
        explanation: 'This query finds products with low inventory that need restocking.',
        estimatedRows: '~25'
      };
    } else if (input.includes('average') && input.includes('order')) {
      return {
        sql: `SELECT r.region_name, 
       AVG(o.total_amount) as avg_order_value,
       COUNT(o.id) as total_orders
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN regions r ON c.region_id = r.id
GROUP BY r.region_name
ORDER BY avg_order_value DESC;`,
        explanation: 'This query calculates the average order value by region with order counts.',
        estimatedRows: '~12'
      };
    } else if (input.includes('top') && input.includes('customers')) {
      return {
        sql: `SELECT c.id, c.name, c.email,
       SUM(o.total_amount) as total_revenue,
       COUNT(o.id) as total_orders
FROM customers c
JOIN orders o ON c.id = o.customer_id
GROUP BY c.id, c.name, c.email
ORDER BY total_revenue DESC
LIMIT 10;`,
        explanation: 'This query finds the top 10 customers by total revenue generated.',
        estimatedRows: '10'
      };
    } else {
      return {
        sql: `-- Generated SQL query for: "${naturalLanguage}"
SELECT *
FROM table_name
WHERE condition = 'value'
ORDER BY created_at DESC
LIMIT 100;`,
        explanation: `This is a general SQL template for your query: "${naturalLanguage}". Connect a database for AI-powered generation.`,
        estimatedRows: '~100'
      };
    }
  };

  const handleExecuteQuery = async () => {
    if (!generatedSQL.trim() || generatedSQL === '-- Your generated SQL will appear here\nSELECT * FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY);') {
      showNotification('Please generate or enter a SQL query first', 'warning');
      return;
    }

    // If no database connection, show demo results
    if (!dbConnection) {
      const demoResults = generateDemoResults();
      setQueryResults(demoResults);
      setActiveTab('results');
      showNotification('Demo results displayed! Connect a database for real data.', 'info');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post(`/api/database/connections/${dbConnection.connectionId}/query`, {
        sql: generatedSQL
      });

      if (response.data.success) {
        setQueryResults(response.data.data.results || []);
        setActiveTab('results');
        showNotification('Query executed successfully!', 'success');
      }
    } catch (error) {
      console.error('Error executing query:', error);
      showNotification('Failed to execute query. Please check your SQL syntax.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const generateDemoResults = () => {
    // Generate mock results based on current SQL
    const columns = ['id', 'name', 'email', 'created_at', 'status'];
    const rows = [];
    
    for (let i = 1; i <= 15; i++) {
      rows.push({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: Math.random() > 0.5 ? 'Active' : 'Inactive'
      });
    }
    
    return rows;
  };

  const handleCopySQL = () => {
    navigator.clipboard.writeText(generatedSQL)
      .then(() => {
        showNotification('SQL copied to clipboard!', 'success');
      })
      .catch(() => {
        showNotification('Failed to copy SQL to clipboard', 'error');
      });
  };

  const handleSaveSQL = () => {
    try {
      const existing = JSON.parse(localStorage.getItem('savedQueries') || '[]');
      const entry = { sql: generatedSQL, explanation, createdAt: new Date().toISOString() };
      existing.unshift(entry);
      localStorage.setItem('savedQueries', JSON.stringify(existing.slice(0, 50)));
      showNotification('Query saved locally', 'success');
    } catch (e) {
      showNotification('Failed to save query', 'error');
    }
  };

  const handleFormatSQL = () => {
    // Very simple formatting: add newlines before common clauses and collapse multiple spaces
    let formatted = generatedSQL.replace(/\s+/g, ' ');
    formatted = formatted.replace(/\s+(FROM|WHERE|GROUP BY|ORDER BY|LIMIT|JOIN|ON|HAVING)\s+/ig, '\n$1 ');
    setGeneratedSQL(formatted);
    showNotification('SQL formatted', 'success');
  };

  const handleConnectDatabase = () => {
    setShowDbModal(true);
  };

  const handleDbConfigChange = (field, value) => {
    setDbConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleTestConnection = async () => {
    // If connection string is provided, skip other required fields
    if (!dbConfig.connectionString && (!dbConfig.type || !dbConfig.host || !dbConfig.database || !dbConfig.username)) {
      showNotification('Please fill in all required fields or provide a connection string', 'warning');
      return;
    }

    setLoading(true);
    try {
      let payload;
      if (dbConfig.connectionString) {
        payload = { connectionString: dbConfig.connectionString };
      } else {
        payload = { ...dbConfig };
        delete payload.connectionString;
      }
      const response = await api.post('/api/database/test-connection', payload);

      if (response.data.success) {
        showNotification('Connection test successful!', 'success');
      } else {
        showNotification('Connection test failed: ' + response.data.message, 'error');
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      showNotification('Connection test failed. Please check your configuration.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDbConnect = async (e) => {
    e.preventDefault();
    if (!dbConfig.connectionString && (!dbConfig.type || !dbConfig.host || !dbConfig.database || !dbConfig.username)) {
      showNotification('Please fill in all required fields or provide a connection string', 'warning');
      return;
    }

    setLoading(true);

    try {
      let payload;
      if (dbConfig.connectionString) {
        payload = { connectionString: dbConfig.connectionString };
      } else {
        payload = { ...dbConfig };
        delete payload.connectionString;
      }
      const response = await api.post('/api/database/connect', payload);

      if (response.data.success) {
        setDbConnection(response.data.data);
        setConnectionStatus('connected');
        setShowDbModal(false);
        showNotification('Database connected successfully!', 'success');
        // Reset form
        setDbConfig({
          connectionString: '',
          type: '',
          host: '',
          port: '',
          database: '',
          username: '',
          password: ''
        });
      } else {
        showNotification('Failed to connect: ' + response.data.message, 'error');
      }
    } catch (error) {
      console.error('Error connecting to database:', error);
      showNotification('Failed to connect to database. Please check your configuration.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Call backend logout endpoint
      await api.post('/api/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Always clear local storage and redirect
      localStorage.removeItem('token');
      navigate('/login');
    }
  };

  const showNotification = (message, type = 'info') => {
    const id = Date.now();
    const notification = { id, message, type };
    setNotifications(prev => [...prev, notification]);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const getNotificationIcon = (type) => {
    const icons = {
      success: 'check-circle',
      error: 'exclamation-circle',
      warning: 'exclamation-triangle',
      info: 'info-circle'
    };
    return icons[type] || 'info-circle';
  };

  const quickExamples = [
    { text: 'Show me all users who registered this month', display: 'Users this month' },
    { text: 'Find products with low inventory', display: 'Low inventory' },
    { text: 'Calculate average order value by region', display: 'Avg order by region' },
    { text: 'List top 10 customers by revenue', display: 'Top customers' }
  ];

  const handleExampleClick = (example) => {
    setNaturalLanguageInput(example);
    // Focus the textarea
    const textarea = document.getElementById('naturalLanguageInput');
    if (textarea) {
      textarea.focus();
    }
  };

  // Initialize drawer position/size and global pointer handlers for drag/resize
  useEffect(() => {
    // center the drawer vertically by default
    setDrawerPos({ right: 0, top: 0 });
    setDrawerSize({ width: 480, height: window.innerHeight });

    const onPointerMove = (e) => {
      if (isDragging) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        // moving horizontally will change the 'right' offset
        const newRight = Math.max(0, dragRef.current.startRight - dx);
        const newTop = Math.max(0, dragRef.current.startTop + dy);
        setDrawerPos(pos => ({ ...pos, right: newRight, top: Math.min(Math.max(newTop, 0), window.innerHeight - 120) }));
      }
      if (isResizing) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        const newWidth = Math.max(300, dragRef.current.startWidth - dx); // resizing by dragging left/right; invert dx
        const newHeight = Math.max(200, dragRef.current.startHeight + dy);
        setDrawerSize(sz => ({ ...sz, width: Math.min(newWidth, window.innerWidth - 100), height: Math.min(newHeight, window.innerHeight - 40) }));
      }
    };

    const onPointerUp = (e) => {
      if (isDragging) setIsDragging(false);
      if (isResizing) setIsResizing(false);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      setDrawerSize(sz => ({ ...sz, height: window.innerHeight }));
      setDrawerPos(pos => ({ ...pos, top: Math.min(pos.top, Math.max(0, window.innerHeight - 120)) }));
    };

    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', onResize);
    };
  }, [isDragging, isResizing]);

  return (
    <div className="dashboard">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="logo">
          <img src={logoImg} alt="DevQuery Logo" />
          <span>DevQuery</span>
        </div>

        <nav className="sidebar-nav">
          <ul>
            <li className="active">
              <a href="#sql-generator">
                <i className="fas fa-database"></i>
                <span>SQL Generator</span>
              </a>
            </li>
            <li>
              <a href="#query-history">
                <i className="fas fa-history"></i>
                <span>Query History</span>
              </a>
            </li>
            <li>
              <a href="#schema-explorer">
                <i className="fas fa-sitemap"></i>
                <span>Schema Explorer</span>
              </a>
            </li>
            <li>
              <a href="#saved-queries">
                <i className="fas fa-bookmark"></i>
                <span>Saved Queries</span>
              </a>
            </li>
            <li>
              <Link to="/analytics">
                <i className="fas fa-chart-line"></i>
                <span>Analytics</span>
              </Link>
            </li>
          </ul>
        </nav>

        <div className="user-profile">
          <div className="user-avatar">
            <i className="fas fa-user"></i>
          </div>
          <div className="user-info">
            <span className="user-name">{user?.name || 'User'}</span>
            <span className="user-role">Developer</span>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Logout">
            <i className="fas fa-sign-out-alt"></i>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content chat-fullscreen">
        <header className="header">
          <div className="header-left">
            <h1>Database Chat</h1>
            <p>Ask questions about your data — chat is the primary interface.</p>
          </div>
          <div className="header-right">
            <button className="btn btn-secondary" onClick={() => setShowSQLDrawer(true)}>
              <i className="fas fa-database"></i>
              SQL Generator
            </button>
            <button className="btn btn-secondary" onClick={handleConnectDatabase}>
              <i className="fas fa-plug"></i>
              Connect Database
            </button>
            <div className={`connection-status ${connectionStatus}`}>
              <i className="fas fa-circle"></i>
              <span>{connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
        </header>

        {/* Fullscreen Chatbox */}
        <div className="chat-main fullscreen">
          <div className="chat-messages-main">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`chat-msg ${msg.sender}`}>{msg.text}</div>
            ))}
          </div>
          <form className="chat-footer-main" onSubmit={handleSendChat} autoComplete="off">
            <input
              id="mainChatInput"
              type="text"
              className="chat-input-main"
              placeholder="Ask about your data..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn btn-primary chat-send-main" disabled={!chatInput.trim()}>
              <i className="fas fa-paper-plane"></i>
            </button>
          </form>
        </div>
      </div>

      {/* SQL Drawer (sliding window) */}
      <div
        className={`sql-drawer${showSQLDrawer ? ' open' : ''} ${dragEnabled ? 'drag-enabled' : ''} ${isFullscreen ? ' fullscreen' : ''}`}
        style={{
          right: showSQLDrawer ? `${drawerPos.right}px` : `-9999px`,
          top: `${drawerPos.top}px`,
          width: `${drawerSize.width}px`,
          height: `${drawerSize.height}px`,
        }}
      >
        <div
          className="sql-drawer-header"
          onDoubleClick={() => setDragEnabled(prev => !prev)}
          onPointerDown={(e) => {
            // start dragging only when dragEnabled and left button
            if (!dragEnabled) return;
            if (e.button !== 0) return;
            setIsDragging(true);
            dragRef.current.startX = e.clientX;
            dragRef.current.startY = e.clientY;
            dragRef.current.startRight = drawerPos.right;
            dragRef.current.startTop = drawerPos.top;
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0 }}>SQL Query Generator</h2>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setIsFullscreen(prev => {
                  const next = !prev;
                  if (next) setDragEnabled(false);
                  return next;
                });
              }}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              <i className={`fas ${isFullscreen ? 'fa-compress' : 'fa-expand'}`}></i>
            </button>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <button
              type="button"
              className="close-sql"
              onPointerDown={(e) => { e.stopPropagation(); }}
              onClick={() => { setShowSQLDrawer(false); setIsFullscreen(false); }}
              title="Close"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
        <div className="sql-drawer-body">
          <div className="quick-examples">
            <span className="examples-label">Examples:</span>
            {quickExamples.map((ex, i) => (
              <button key={i} className="example-tag" onClick={() => handleExampleClick(ex.text)}>{ex.display}</button>
            ))}
          </div>
          {/* Reuse existing generator UI inside drawer */}
          <div className="input-container">
            <label htmlFor="naturalLanguageInput">Describe what you want to query:</label>
            <div className="input-wrapper">
              <textarea
                id="naturalLanguageInput"
                value={naturalLanguageInput}
                onChange={(e) => setNaturalLanguageInput(e.target.value)}
                placeholder="e.g., Show me all customers who made purchases in the last 30 days"
                rows="4"
              />
              <button className="btn btn-primary" onClick={handleGenerateSQL} disabled={loading}>
                <i className="fas fa-magic"></i>
                {loading ? 'Generating...' : 'Generate SQL'}
              </button>
            </div>
          </div>

          <div className="result-tabs">
            <button className={`tab-btn ${activeTab === 'sql' ? 'active' : ''}`} onClick={() => setActiveTab('sql')}>Generated SQL</button>
            <button className={`tab-btn ${activeTab === 'results' ? 'active' : ''}`} onClick={() => setActiveTab('results')}>Query Results</button>
            <button className={`tab-btn ${activeTab === 'explanation' ? 'active' : ''}`} onClick={() => setActiveTab('explanation')}>Explanation</button>
          </div>

          <div className="tab-content">
            {activeTab === 'sql' && (
              <div className="sql-view">
                <div className="sql-editor">
                  <div className="editor-header">
                    <div className="editor-title">Generated SQL</div>
                    <div className="editor-actions">
                      <span className="query-info">Estimated rows: {estimatedRows}</span>
                      <button className="btn btn-success" onClick={handleExecuteQuery} disabled={!dbConnection || loading}>
                        <i className="fas fa-play"></i>
                        {loading ? 'Executing...' : 'Execute'}
                      </button>
                      <button className="btn btn-sm" onClick={handleCopySQL} title="Copy to clipboard">
                        <i className="fas fa-copy"></i>
                      </button>
                      <button className="btn btn-sm" onClick={handleSaveSQL} title="Save query">
                        <i className="fas fa-save"></i>
                      </button>
                      <button className="btn btn-sm" onClick={handleFormatSQL} title="Format SQL">
                        <i className="fas fa-code"></i>
                      </button>
                    </div>
                  </div>
                  <div className="code-editor">
                    <pre><code className="sql-code">{generatedSQL}</code></pre>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'results' && (
              <div className="results-view">
                <div className="results-header">
                  <div className="results-title">Query Results</div>
                  <div className="results-actions">
                    <div className="results-count">{queryResults.length} rows</div>
                    <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(JSON.stringify(queryResults, null, 2)); showNotification('Results copied', 'success'); }}>
                      <i className="fas fa-copy"></i>
                    </button>
                    <button className="btn btn-sm" onClick={() => { const csv = queryResults.length ? Object.keys(queryResults[0]).join(',') + '\n' + queryResults.map(r => Object.values(r).map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n') : ''; const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'results.csv'; a.click(); URL.revokeObjectURL(url); }}>
                      <i className="fas fa-file-csv"></i>
                    </button>
                  </div>
                </div>
                {queryResults.length > 0 ? (
                  <div className="table-container">
                    <table className="results-table">
                      <thead>
                        <tr>
                          {Object.keys(queryResults[0]).map(key => (
                            <th key={key}>{key}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {queryResults.map((row, index) => (
                          <tr key={index}>
                            {Object.values(row).map((value, i) => (
                              <td key={i}>{String(value)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="no-results">
                    <i className="fas fa-table"></i>
                    <p>Execute a query to see results</p>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'explanation' && (
              <div className="explanation-view">
                <div className="explanation-header">
                  <h4>Explanation</h4>
                </div>
                <div className="explanation-content">
                  <p style={{ whiteSpace: 'pre-wrap' }}>{explanation}</p>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Resizer handle */}
        <div
          className="sql-drawer-resizer"
          onPointerDown={(e) => {
            // left button only
            if (e.button !== 0) return;
            setIsResizing(true);
            dragRef.current.startX = e.clientX;
            dragRef.current.startY = e.clientY;
            dragRef.current.startWidth = drawerSize.width;
            dragRef.current.startHeight = drawerSize.height;
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }}
        />
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner">
            <i className="fas fa-spinner fa-spin"></i>
            <span>Processing...</span>
          </div>
        </div>
      )}

      {/* Database Connection Modal */}
      {showDbModal && (
        <div className="modal" onClick={(e) => {
          if (e.target.className === 'modal') {
            setShowDbModal(false);
          }
        }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3>Connect to Database</h3>
              <button className="close-modal" onClick={() => setShowDbModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="modal-body">
              <form onSubmit={handleDbConnect}>
                <div className="form-group">
                  <label htmlFor="dbConnectionString">Connection String (optional)</label>
                  <input
                    type="text"
                    id="dbConnectionString"
                    placeholder="e.g. mongodb+srv://user:pass@host/db"
                    value={dbConfig.connectionString}
                    onChange={e => handleDbConfigChange('connectionString', e.target.value)}
                  />
                  <small style={{ color: '#888' }}>If provided, all other fields are optional.</small>
                </div>

                <div className="form-group">
                  <label htmlFor="dbType">Database Type *</label>
                  <select
                    id="dbType"
                    value={dbConfig.type}
                    onChange={(e) => handleDbConfigChange('type', e.target.value)}
                    required={!dbConfig.connectionString}
                    disabled={!!dbConfig.connectionString}
                  >
                    <option value="">Select database type</option>
                    <option value="mysql">MySQL</option>
                    <option value="postgresql">PostgreSQL</option>
                    <option value="sqlite">SQLite</option>
                    <option value="mssql">SQL Server</option>
                    <option value="oracle">Oracle</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="dbHost">Host *</label>
                  <input
                    type="text"
                    id="dbHost"
                    placeholder="localhost"
                    value={dbConfig.host}
                    onChange={(e) => handleDbConfigChange('host', e.target.value)}
                    required={!dbConfig.connectionString}
                    disabled={!!dbConfig.connectionString}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="dbPort">Port</label>
                  <input
                    type="number"
                    id="dbPort"
                    placeholder="3306"
                    value={dbConfig.port}
                    onChange={(e) => handleDbConfigChange('port', e.target.value)}
                    disabled={!!dbConfig.connectionString}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="dbName">Database Name *</label>
                  <input
                    type="text"
                    id="dbName"
                    placeholder="my_database"
                    value={dbConfig.database}
                    onChange={(e) => handleDbConfigChange('database', e.target.value)}
                    required={!dbConfig.connectionString}
                    disabled={!!dbConfig.connectionString}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="dbUser">Username *</label>
                  <input
                    type="text"
                    id="dbUser"
                    placeholder="username"
                    value={dbConfig.username}
                    onChange={(e) => handleDbConfigChange('username', e.target.value)}
                    required={!dbConfig.connectionString}
                    disabled={!!dbConfig.connectionString}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="dbPassword">Password</label>
                  <input
                    type="password"
                    id="dbPassword"
                    placeholder="password"
                    value={dbConfig.password}
                    onChange={(e) => handleDbConfigChange('password', e.target.value)}
                    disabled={!!dbConfig.connectionString}
                  />
                </div>
                
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={handleTestConnection} disabled={loading}>
                    <i className="fas fa-check"></i>
                    {loading ? 'Testing...' : 'Test Connection'}
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    <i className="fas fa-plug"></i>
                    {loading ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Notifications */}
      <div className="notifications-container">
        {notifications.map((notification) => (
          <div key={notification.id} className={`notification notification-${notification.type}`}>
            <i className={`fas fa-${getNotificationIcon(notification.type)}`}></i>
            <span>{notification.message}</span>
            <button className="close-notification" onClick={() => removeNotification(notification.id)}>
              &times;
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Dashboard;
