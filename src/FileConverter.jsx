import React, { useState } from 'react';

const styles = `
  .fc-root {
    background: #0a0a0a;
    min-height: 100vh;
    padding: 2rem 1rem;
    font-family: system-ui, -apple-system, sans-serif;
    box-sizing: border-box;
  }
  .fc-root *, .fc-root *::before, .fc-root *::after {
    box-sizing: border-box;
  }
  .fc-shell {
    max-width: 520px;
    margin: 0 auto;
  }
  .fc-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 2rem;
  }
  .fc-brand-icon {
    width: 32px;
    height: 32px;
    background: #fff;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .fc-brand-icon svg {
    width: 16px;
    height: 16px;
    stroke: #0a0a0a;
    fill: none;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .fc-brand-name {
    font-size: 15px;
    font-weight: 600;
    color: #fff;
    letter-spacing: 0.02em;
  }
  .fc-brand-tag {
    font-size: 11px;
    color: #555;
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 20px;
    padding: 2px 8px;
    margin-left: 4px;
  }
  .fc-card {
    background: #111;
    border: 1px solid #222;
    border-radius: 16px;
    overflow: hidden;
  }
  .fc-tabs {
    display: flex;
    padding: 6px;
    gap: 4px;
    background: #0a0a0a;
    border-bottom: 1px solid #1a1a1a;
  }
  .fc-tab {
    flex: 1;
    padding: 9px 6px;
    font-size: 12px;
    font-weight: 500;
    background: transparent;
    border: none;
    cursor: pointer;
    color: #555;
    border-radius: 8px;
    transition: all 0.18s;
    letter-spacing: 0.01em;
  }
  .fc-tab:hover {
    color: #aaa;
    background: #161616;
  }
  .fc-tab.active {
    background: #fff;
    color: #0a0a0a;
  }
  .fc-body {
    padding: 1.5rem;
  }
  .fc-section-label {
    font-size: 11px;
    font-weight: 600;
    color: #444;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 10px;
  }
  .fc-textarea {
    width: 100%;
    min-height: 130px;
    padding: 14px;
    font-size: 13px;
    font-family: system-ui, sans-serif;
    color: #e0e0e0;
    background: #0d0d0d;
    border: 1px solid #222;
    border-radius: 10px;
    resize: vertical;
    outline: none;
    transition: border-color 0.18s;
    line-height: 1.6;
  }
  .fc-textarea::placeholder {
    color: #333;
  }
  .fc-textarea:focus {
    border-color: #444;
  }
  .fc-char {
    font-size: 11px;
    color: #333;
    text-align: right;
    margin-top: 5px;
    margin-bottom: 1.25rem;
  }
  .fc-drop-zone {
    border: 1px dashed #2a2a2a;
    border-radius: 10px;
    padding: 2rem 1.5rem;
    text-align: center;
    cursor: pointer;
    transition: all 0.18s;
    background: #0d0d0d;
    margin-bottom: 1rem;
  }
  .fc-drop-zone:hover,
  .fc-drop-zone.drag {
    border-color: #555;
    background: #141414;
  }
  .fc-drop-icon {
    width: 38px;
    height: 38px;
    background: #1a1a1a;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 12px;
  }
  .fc-drop-icon svg {
    width: 18px;
    height: 18px;
    stroke: #555;
    fill: none;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .fc-drop-label {
    font-size: 13px;
    font-weight: 500;
    color: #888;
  }
  .fc-drop-sub {
    font-size: 12px;
    color: #333;
    margin-top: 3px;
  }
  .fc-file-pill {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 10px;
    margin-bottom: 1rem;
  }
  .fc-fp-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #3d9a6f;
    flex-shrink: 0;
  }
  .fc-fp-name {
    font-size: 13px;
    color: #ccc;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fc-fp-clear {
    background: none;
    border: none;
    cursor: pointer;
    color: #444;
    padding: 0 2px;
    font-size: 14px;
    transition: color 0.15s;
    line-height: 1;
  }
  .fc-fp-clear:hover {
    color: #888;
  }
  .fc-convert-btn {
    width: 100%;
    padding: 14px;
    font-size: 14px;
    font-weight: 600;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.18s;
    letter-spacing: 0.01em;
    margin-top: 4px;
  }
  .fc-convert-btn svg {
    width: 15px;
    height: 15px;
    stroke: currentColor;
    fill: none;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .fc-convert-btn.ready {
    background: #fff;
    color: #0a0a0a;
  }
  .fc-convert-btn.ready:hover {
    background: #e8e8e8;
  }
  .fc-convert-btn.ready:active {
    transform: scale(0.98);
  }
  .fc-convert-btn.off {
    background: #161616;
    color: #333;
    cursor: not-allowed;
    border: 1px solid #1e1e1e;
  }
  .fc-footer {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-top: 14px;
  }
  .fc-stat {
    background: #0d0d0d;
    border: 1px solid #1a1a1a;
    border-radius: 8px;
    padding: 10px 12px;
  }
  .fc-stat-label {
    font-size: 10px;
    color: #333;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 3px;
  }
  .fc-stat-value {
    font-size: 12px;
    font-weight: 500;
    color: #777;
  }
  .fc-stat-value.live {
    color: #3d9a6f;
  }
  @media (max-width: 400px) {
    .fc-body { padding: 1rem; }
    .fc-brand { margin-bottom: 1.25rem; }
    .fc-tab { font-size: 11px; padding: 8px 4px; }
  }
`;

const FileConverter = () => {
    const [activeTab, setActiveTab] = useState('text-pdf');
    const [text, setText] = useState('');
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [drag, setDrag] = useState(false);

    const modeLabels = { 'text-pdf': 'Text → PDF', 'word-pdf': 'Word → PDF', 'pdf-word': 'PDF → Word' };
    const fmtLabels  = { 'text-pdf': 'PDF', 'word-pdf': 'PDF', 'pdf-word': 'Word (.docx)' };
    const secLabels  = { 'text-pdf': 'Paste your text', 'word-pdf': 'Upload Word file', 'pdf-word': 'Upload PDF file' };

    const isReady = activeTab === 'text-pdf' ? text.trim().length > 0 : !!file;

    const getStatus = () => {
        if (loading) return { label: 'Converting…', live: true };
        if (isReady) return { label: 'Ready', live: true };
        return { label: 'Waiting', live: false };
    };

    const handleTabSwitch = (tab) => {
        setActiveTab(tab);
        setFile(null);
        setDrag(false);
    };

    const handleFileChange = (e) => {
        const f = e.target.files[0];
        if (f) setFile(f);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f) setFile(f);
    };

    const handleAction = async () => {
        setLoading(true);
        const baseUrl ="https://pdf-qna-backend.onrender.com" ||"http://localhost:8000";
        let url = "";
        let options = {};

        try {
            if (activeTab === 'text-pdf') {
                url = `${baseUrl}/convert/text-to-pdf?text=${encodeURIComponent(text)}`;
                options = { method: 'POST' };
            } else {
                const formData = new FormData();
                formData.append('file', file);
                url = activeTab === 'word-pdf' ? `${baseUrl}/convert/word-to-pdf` : `${baseUrl}/convert/pdf-to-word`;
                options = { method: 'POST', body: formData };
            }

            const response = await fetch(url, options);
            if (!response.ok) throw new Error("Conversion failed");

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = activeTab.endsWith('pdf') ? "result.pdf" : "result.docx";
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    const status = getStatus();

    return (
        <>
            <style>{styles}</style>
            <div className="fc-root">
                <div className="fc-shell">

                    <div className="fc-brand">
                        <div className="fc-brand-icon">
                            <svg viewBox="0 0 24 24">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="12" y1="18" x2="12" y2="12"/>
                                <line x1="9" y1="15" x2="15" y2="15"/>
                            </svg>
                        </div>
                        <span className="fc-brand-name">FileConvert</span>
                        <span className="fc-brand-tag">free</span>
                    </div>

                    <div className="fc-card">
                        <div className="fc-tabs">
                            {['text-pdf', 'word-pdf', 'pdf-word'].map(t => (
                                <button
                                    key={t}
                                    className={`fc-tab${activeTab === t ? ' active' : ''}`}
                                    onClick={() => handleTabSwitch(t)}
                                >
                                    {modeLabels[t]}
                                </button>
                            ))}
                        </div>

                        <div className="fc-body">
                            <div className="fc-section-label">{secLabels[activeTab]}</div>

                            {activeTab === 'text-pdf' && (
                                <>
                                    <textarea
                                        className="fc-textarea"
                                        placeholder="Start typing or paste content here…"
                                        value={text}
                                        onChange={(e) => setText(e.target.value)}
                                    />
                                    <div className="fc-char">{text.length} chars</div>
                                </>
                            )}

                            {activeTab !== 'text-pdf' && !file && (
                                <div
                                    className={`fc-drop-zone${drag ? ' drag' : ''}`}
                                    onClick={() => document.getElementById(`fc-file-input`).click()}
                                    onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                                    onDragLeave={() => setDrag(false)}
                                    onDrop={handleDrop}
                                >
                                    <div className="fc-drop-icon">
                                        <svg viewBox="0 0 24 24">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                            <polyline points="17 8 12 3 7 8"/>
                                            <line x1="12" y1="3" x2="12" y2="15"/>
                                        </svg>
                                    </div>
                                    <div className="fc-drop-label">
                                        Drop your {activeTab === 'word-pdf' ? '.docx' : '.pdf'} file
                                    </div>
                                    <div className="fc-drop-sub">or click to browse</div>
                                </div>
                            )}

                            {activeTab !== 'text-pdf' && (
                                <input
                                    id="fc-file-input"
                                    type="file"
                                    hidden
                                    accept={activeTab === 'word-pdf' ? ".docx" : ".pdf"}
                                    onChange={handleFileChange}
                                />
                            )}

                            {activeTab !== 'text-pdf' && file && (
                                <div className="fc-file-pill">
                                    <span className="fc-fp-dot" />
                                    <span className="fc-fp-name">{file.name}</span>
                                    <button className="fc-fp-clear" onClick={() => setFile(null)}>✕</button>
                                </div>
                            )}

                            <button
                                className={`fc-convert-btn${isReady && !loading ? ' ready' : ' off'}`}
                                onClick={handleAction}
                                disabled={loading || !isReady}
                            >
                                <svg viewBox="0 0 24 24">
                                    <polyline points="8 17 3 12 8 7"/>
                                    <polyline points="16 7 21 12 16 17"/>
                                </svg>
                                {loading ? 'Processing…' : 'Convert & Download'}
                            </button>

                            <div className="fc-footer">
                                <div className="fc-stat">
                                    <div className="fc-stat-label">Mode</div>
                                    <div className="fc-stat-value">{modeLabels[activeTab]}</div>
                                </div>
                                <div className="fc-stat">
                                    <div className="fc-stat-label">Output</div>
                                    <div className="fc-stat-value">{fmtLabels[activeTab]}</div>
                                </div>
                                <div className="fc-stat">
                                    <div className="fc-stat-label">Status</div>
                                    <div className={`fc-stat-value${status.live ? ' live' : ''}`}>{status.label}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </>
    );
};

export default FileConverter;