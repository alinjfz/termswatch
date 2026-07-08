import { useEffect, useMemo, useState } from 'react';

const DEFAULT_MODEL = 'openrouter/free';
const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:8787' : '';

const emptyForm = {
  mode: 'url',
  model: DEFAULT_MODEL,
  previousUrl: '',
  currentUrl: '',
  previousText: '',
  currentText: '',
};

const emptyAuth = {
  name: '',
  email: '',
  password: '',
};

function classNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

function getLocationState() {
  return {
    path: window.location.pathname,
    search: window.location.search,
  };
}

function navigateTo(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function currentReportIdFromPath(path) {
  const match = path.match(/^\/app\/reports\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function metricCards(metrics) {
  return [
    { label: 'Total changes', value: metrics?.total ?? 0 },
    { label: 'High risk', value: metrics?.highRisk ?? 0 },
    { label: 'Modified', value: metrics?.modified ?? 0 },
    { label: 'Added', value: metrics?.added ?? 0 },
  ];
}

function workspaceStats(stats, history) {
  return [
    { label: 'Comparisons', value: stats?.totalComparisons ?? history.length ?? 0 },
    { label: 'High-risk flags', value: stats?.highRiskFlags ?? 0 },
    { label: 'Changed clauses', value: stats?.totalChangedClauses ?? 0 },
  ];
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const rawText = await response.text();
  const json = contentType.includes('application/json') && rawText ? JSON.parse(rawText) : null;

  if (!response.ok) {
    throw new Error(json?.error || `Request failed (${response.status})`);
  }

  if (!json) {
    throw new Error('The server returned an unexpected response.');
  }

  return json;
}

function AppNav({ currentPath }) {
  const links = [
    { label: 'Overview', path: '/app' },
    { label: 'New Comparison', path: '/app/new' },
    { label: 'Reports', path: '/app/reports' },
    { label: 'Settings', path: '/app/settings' },
  ];

  return (
    <nav className="app-nav">
      {links.map((link) => (
        <button
          key={link.path}
          className={classNames('nav-link', currentPath === link.path && 'is-active')}
          onClick={() => navigateTo(link.path)}
        >
          {link.label}
        </button>
      ))}
    </nav>
  );
}

function LandingPage({ authMode, setAuthMode, authForm, updateAuthField, handleAuthSubmit, authLoading, authError }) {
  return (
    <div className="site-shell">
      <div className="bg-orb bg-orb-a" />
      <div className="bg-orb bg-orb-b" />

      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">TW</span>
          <div>
            <strong>TermsWatch</strong>
            <p>Policy change intelligence</p>
          </div>
        </div>
        <nav className="top-actions">
          <button className="nav-button" onClick={() => setAuthMode('login')}>
            Log in
          </button>
          <button className="primary-button" onClick={() => setAuthMode('signup')}>
            Start free
          </button>
        </nav>
      </header>

      <main className="landing-main">
        <section className="landing-hero glass-card">
          <div className="landing-copy">
            <p className="section-label">Monitor terms without manual redlines</p>
            <h1>Policy review infrastructure for legal, procurement, privacy, and trust teams.</h1>
            <p className="hero-text">
              TermsWatch collects two policy versions, identifies the clauses that changed,
              explains the impact in plain language, and gives your team a review-ready output
              you can save, share, and act on.
            </p>
            <div className="hero-badges">
              <span className="pill">URL ingestion</span>
              <span className="pill">Clause-level diffing</span>
              <span className="pill">Risk-ranked summaries</span>
              <span className="pill">Private workspace</span>
            </div>
            <div className="landing-metrics">
              <div className="metric-showcase">
                <strong>One workspace</strong>
                <span>Ingest, compare, review, export</span>
              </div>
              <div className="metric-showcase">
                <strong>Built for teams</strong>
                <span>Legal ops, procurement, compliance, vendor risk</span>
              </div>
              <div className="metric-showcase">
                <strong>Fast first pass</strong>
                <span>Reduce review time before escalation</span>
              </div>
            </div>
          </div>

          <div className="auth-card">
            <div className="card-heading">
              <div>
                <p className="section-label">{authMode === 'signup' ? 'Create workspace' : 'Sign in'}</p>
                <h2>{authMode === 'signup' ? 'Open your TermsWatch account' : 'Access your dashboard'}</h2>
              </div>
            </div>

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              {authMode === 'signup' && (
                <label className="field">
                  <span>Full name</span>
                  <input value={authForm.name} onChange={(event) => updateAuthField('name', event.target.value)} />
                </label>
              )}
              <label className="field">
                <span>Email</span>
                <input type="email" value={authForm.email} onChange={(event) => updateAuthField('email', event.target.value)} />
              </label>
              <label className="field">
                <span>Password</span>
                <input type="password" value={authForm.password} onChange={(event) => updateAuthField('password', event.target.value)} />
              </label>
              <button className="primary-button auth-button" disabled={authLoading}>
                {authLoading ? 'Working…' : authMode === 'signup' ? 'Create account' : 'Log in'}
              </button>
              {authError && <div className="error-banner">{authError}</div>}
            </form>

            <div className="auth-footer">
              <span>{authMode === 'signup' ? 'Already have an account?' : 'Need an account?'}</span>
              <button
                className="inline-button"
                onClick={() => setAuthMode((current) => (current === 'signup' ? 'login' : 'signup'))}
              >
                {authMode === 'signup' ? 'Log in' : 'Sign up'}
              </button>
            </div>
          </div>
        </section>

        <section className="trust-strip">
          <span>Structured summaries</span>
          <span>Clause-aware comparisons</span>
          <span>Saved review history</span>
          <span>Markdown export</span>
          <span>Private account workspace</span>
        </section>

        <section className="landing-grid">
          <article className="glass-card landing-panel">
            <p className="section-label">Platform</p>
            <h2>Everything needed for policy drift review</h2>
            <div className="feature-list">
              <div><strong>Ingest live URLs</strong><span>Collect the old and new versions directly from source pages when possible.</span></div>
              <div><strong>Normalize and compare</strong><span>Detect added, removed, and modified clauses in a stable review pipeline.</span></div>
              <div><strong>Assess materiality</strong><span>Rank risk and translate changes into concise, plain-English takeaways.</span></div>
              <div><strong>Preserve the record</strong><span>Keep a searchable workspace history with exports for follow-up and audit trails.</span></div>
            </div>
          </article>

          <article className="glass-card landing-panel">
            <p className="section-label">Who it serves</p>
            <h2>Designed for teams who review terms at scale</h2>
            <div className="feature-list">
              <div><strong>Legal operations</strong><span>Speed up first-pass review before handing material issues to counsel.</span></div>
              <div><strong>Procurement and vendor risk</strong><span>Catch policy and commercial term changes before approvals move ahead.</span></div>
              <div><strong>Privacy and trust</strong><span>Track changes in disclosures, data handling language, and dispute terms.</span></div>
              <div><strong>Founders and operators</strong><span>Keep policy changes visible without turning the process into manual overhead.</span></div>
            </div>
          </article>
        </section>

        <section className="glass-card landing-panel">
          <div className="card-heading">
            <div>
              <p className="section-label">Workflow</p>
              <h2>From URL to review packet in one pass</h2>
            </div>
          </div>
          <div className="workflow-grid">
            <div className="workflow-step">
              <span>01</span>
              <strong>Collect versions</strong>
              <p>Bring in URLs or pasted text for the original and updated policy.</p>
            </div>
            <div className="workflow-step">
              <span>02</span>
              <strong>Generate the diff</strong>
              <p>Normalize sections and identify clause-level changes with consistent structure.</p>
            </div>
            <div className="workflow-step">
              <span>03</span>
              <strong>Prioritize what matters</strong>
              <p>Highlight material changes, summarize risk, and produce a report your team can use immediately.</p>
            </div>
          </div>
        </section>

        <section className="landing-detail-grid">
          <article className="glass-card landing-panel">
            <p className="section-label">Outputs</p>
            <h2>Built to shorten time-to-decision</h2>
            <div className="output-preview">
              <div className="output-card">
                <strong>Executive summary</strong>
                <p>Review-ready bullets for stakeholders who do not need the full legal text.</p>
              </div>
              <div className="output-card">
                <strong>Risk-tagged changes</strong>
                <p>Surface high-impact clauses first so teams know where to focus.</p>
              </div>
              <div className="output-card">
                <strong>Shareable reports</strong>
                <p>Keep findings portable through saved history and exportable markdown.</p>
              </div>
            </div>
          </article>

          <article className="glass-card landing-panel">
            <p className="section-label">Security and control</p>
            <h2>A serious product surface, not a throwaway demo</h2>
            <div className="feature-list">
              <div><strong>Authenticated workspace</strong><span>Each user has private history and account-scoped reports.</span></div>
              <div><strong>Structured API layer</strong><span>Landing, auth, dashboard, and report flows are separated clearly.</span></div>
              <div><strong>Model flexibility</strong><span>OpenRouter free by default, with provider fallback when needed.</span></div>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

function DashboardOverview({ user, stats, history, setRoute, setReportId }) {
  const recent = history.slice(0, 4);
  return (
    <>
      <section className="dashboard-hero glass-card">
        <div className="hero-copy">
          <p className="section-label">Workspace overview</p>
          <h1>{user?.name ? `${user.name}, your policy review desk is live.` : 'Your policy review desk is live.'}</h1>
          <p className="hero-text">
            Start a new comparison, reopen saved reports, and keep your first-pass review workflow inside one focused workspace.
          </p>
        </div>
        <div className="dashboard-overview">
          {workspaceStats(stats, history).map((item) => (
            <div key={item.label} className="metric-showcase">
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="glass-card dashboard-panel">
          <div className="card-heading">
            <div>
              <p className="section-label">Start fast</p>
              <h2>Next actions</h2>
            </div>
          </div>
          <div className="action-tile-grid">
            <button className="action-tile" onClick={() => setRoute('/app/new')}>
              <strong>Run a new comparison</strong>
              <span>Upload two versions by URL or pasted text and generate a fresh review.</span>
            </button>
            <button className="action-tile" onClick={() => setRoute('/app/reports')}>
              <strong>Open saved reports</strong>
              <span>Review older outputs, export findings, and revisit high-risk changes.</span>
            </button>
            <button className="action-tile" onClick={() => setRoute('/app/settings')}>
              <strong>Adjust workspace settings</strong>
              <span>Check your provider defaults and account details.</span>
            </button>
          </div>
        </article>

        <article className="glass-card dashboard-panel">
          <div className="card-heading">
            <div>
              <p className="section-label">Recent activity</p>
              <h2>Latest reports</h2>
            </div>
          </div>
          <div className="recent-report-list">
            {recent.map((item) => (
              <button
                key={item.id}
                className="recent-report"
                onClick={() => {
                  setReportId(item.id);
                  setRoute(`/app/reports/${item.id}`);
                }}
              >
                <strong>{item.headline}</strong>
                <span>{item.metrics.total} changes · {item.metrics.highRisk} high-risk</span>
                <span>{new Date(item.createdAt).toLocaleString()}</span>
              </button>
            ))}
            {!recent.length && <p className="muted">No comparisons yet. Run your first review to populate the workspace.</p>}
          </div>
        </article>
      </section>
    </>
  );
}

function ComparisonWorkspace({
  form,
  setForm,
  samples,
  loadSample,
  loading,
  error,
  handleCompare,
  report,
  setRoute,
}) {
  return (
    <section className="workspace-grid">
      <form className="glass-card composer-card" onSubmit={handleCompare}>
        <div className="card-heading">
          <div>
            <p className="section-label">Comparison engine</p>
            <h2>Run a new review</h2>
          </div>
          <div className="mode-toggle">
            <button
              type="button"
              className={classNames('toggle-chip', form.mode === 'url' && 'is-selected')}
              onClick={() => setForm((current) => ({ ...current, mode: 'url' }))}
            >
              URLs
            </button>
            <button
              type="button"
              className={classNames('toggle-chip', form.mode === 'text' && 'is-selected')}
              onClick={() => setForm((current) => ({ ...current, mode: 'text' }))}
            >
              Pasted text
            </button>
          </div>
        </div>

        <div className="sample-row">
          {samples.map((sample) => (
            <button key={sample.id} type="button" className="sample-card" onClick={() => loadSample(sample.id)}>
              <strong>{sample.name}</strong>
              <span>{sample.description}</span>
            </button>
          ))}
        </div>

        <label className="field">
          <span>Model</span>
          <input value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} />
        </label>

        {form.mode === 'url' ? (
          <div className="field-grid">
            <label className="field">
              <span>Original policy URL</span>
              <input
                type="url"
                value={form.previousUrl}
                placeholder="https://example.com/privacy-v1"
                onChange={(event) => setForm((current) => ({ ...current, previousUrl: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Updated policy URL</span>
              <input
                type="url"
                value={form.currentUrl}
                placeholder="https://example.com/privacy-v2"
                onChange={(event) => setForm((current) => ({ ...current, currentUrl: event.target.value }))}
              />
            </label>
          </div>
        ) : (
          <div className="field-grid two-up">
            <label className="field">
              <span>Original policy text</span>
              <textarea rows="12" value={form.previousText} onChange={(event) => setForm((current) => ({ ...current, previousText: event.target.value }))} />
            </label>
            <label className="field">
              <span>Updated policy text</span>
              <textarea rows="12" value={form.currentText} onChange={(event) => setForm((current) => ({ ...current, currentText: event.target.value }))} />
            </label>
          </div>
        )}

        <div className="toolbar">
          <button className="primary-button" disabled={loading}>{loading ? 'Analyzing…' : 'Run comparison'}</button>
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setForm((current) => ({
                ...current,
                previousUrl: current.currentUrl,
                currentUrl: current.previousUrl,
                previousText: current.currentText,
                currentText: current.previousText,
              }))
            }
          >
            Swap versions
          </button>
          {report?.id && (
            <button type="button" className="secondary-button" onClick={() => setRoute(`/app/reports/${report.id}`)}>
              Open latest report
            </button>
          )}
        </div>
        <p className="muted small">Live fetch when available. Text fallback when a site blocks access or extraction is noisy.</p>
        {error && <div className="error-banner">{error}</div>}
      </form>

      <section className="glass-card run-card">
        <div className="card-heading">
          <div>
            <p className="section-label">AI workflow</p>
            <h2>Pipeline status</h2>
          </div>
          <span className="pill">{loading ? 'Working' : report ? 'Ready' : 'Idle'}</span>
        </div>
        <ol className="run-log">
          {(report?.runLog || [
            { title: 'Awaiting input', detail: 'Load a sample, enter URLs, or paste text.' },
            { title: 'Private by default', detail: 'Comparisons and history are scoped to your authenticated workspace.' },
            { title: 'Review-ready output', detail: 'Summaries, risk tags, filters, and export controls appear after each run.' },
          ]).map((item, index) => (
            <li key={item.title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}

function ReportsPage({ history, setRoute, setReportId }) {
  return (
    <section className="glass-card dashboard-panel">
      <div className="card-heading">
        <div>
          <p className="section-label">Reports</p>
          <h2>Saved comparisons</h2>
        </div>
      </div>
      <div className="report-table">
        {history.map((item) => (
          <button
            key={item.id}
            className="report-row"
            onClick={() => {
              setReportId(item.id);
              setRoute(`/app/reports/${item.id}`);
            }}
          >
            <div>
              <strong>{item.headline}</strong>
              <span>{item.sources.previous.title} → {item.sources.current.title}</span>
            </div>
            <div>
              <strong>{item.metrics.highRisk}</strong>
              <span>High-risk</span>
            </div>
            <div>
              <strong>{item.metrics.total}</strong>
              <span>Total changes</span>
            </div>
            <div>
              <strong>{new Date(item.createdAt).toLocaleDateString()}</strong>
              <span>{item.modelMode}</span>
            </div>
          </button>
        ))}
        {!history.length && <p className="muted">No saved reports yet.</p>}
      </div>
    </section>
  );
}

function ReportDetail({ report, filters, setFilters, copied, copyShareLink }) {
  const filteredChanges = useMemo(
    () =>
      (report?.changes || []).filter((change) => {
        const riskMatch = filters.risk === 'all' || change.riskLevel === filters.risk;
        const typeMatch = filters.changeType === 'all' || change.changeType === filters.changeType;
        return riskMatch && typeMatch;
      }),
    [filters, report],
  );

  if (!report) {
    return (
      <section className="glass-card dashboard-panel">
        <p className="section-label">Report detail</p>
        <h2>Select a report</h2>
        <p className="muted">Choose a saved comparison from the reports list or run a new review.</p>
      </section>
    );
  }

  return (
    <>
      <section className="summary-grid">
        <article className="glass-card">
          <div className="card-heading">
            <div>
              <p className="section-label">Executive output</p>
              <h2>Summary</h2>
            </div>
            <div className="score-badge">{report?.metrics.score ?? 0}</div>
          </div>
          <h3 className="headline">{report.overview.headline}</h3>
          <div className="field-grid two-up copy-grid">
            <div>
              <h4>Top takeaways</h4>
              <ul>
                {report.overview.summaryBullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Why this matters</h4>
              <ul>
                {report.overview.whyMatters.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </article>

        <article className="glass-card">
          <div className="card-heading">
            <div>
              <p className="section-label">Actions</p>
              <h2>Report controls</h2>
            </div>
          </div>
          <div className="metrics-grid">
            {metricCards(report.metrics).map((metric) => (
              <div key={metric.label} className="metric-tile">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
          <div className="action-stack">
            <button type="button" className="secondary-button" onClick={copyShareLink}>
              {copied ? 'Link copied' : 'Copy share link'}
            </button>
            <a className="secondary-button as-link" href={`${API_BASE}/api/export/${report.id}`}>
              Export markdown
            </a>
            <button type="button" className="secondary-button" onClick={() => window.print()}>
              Print report
            </button>
          </div>
          <p className="muted small">{report.overview.disclaimer}</p>
        </article>
      </section>

      <section className="glass-card diff-card">
        <div className="card-heading">
          <div>
            <p className="section-label">Clause review</p>
            <h2>Changed clauses</h2>
          </div>
          <div className="filters">
            <select value={filters.risk} onChange={(event) => setFilters((current) => ({ ...current, risk: event.target.value }))}>
              <option value="all">All risk levels</option>
              <option value="high">High risk</option>
              <option value="medium">Medium risk</option>
              <option value="low">Low risk</option>
            </select>
            <select value={filters.changeType} onChange={(event) => setFilters((current) => ({ ...current, changeType: event.target.value }))}>
              <option value="all">All change types</option>
              <option value="modified">Modified</option>
              <option value="added">Added</option>
              <option value="removed">Removed</option>
            </select>
          </div>
        </div>

        <div className="changes-list">
          {filteredChanges.map((change) => (
            <article key={change.id} className="change-card">
              <div className="change-topline">
                <div>
                  <h3>{change.heading}</h3>
                  <p>{change.changeLabel}</p>
                </div>
                <div className={classNames('risk-chip', `risk-${change.riskLevel}`)}>{change.riskLabel}</div>
              </div>
              <p className="change-summary">{change.summary}</p>
              <p className="muted">{change.whyItMatters}</p>
              <div className="tag-row">
                {change.tags.map((tag) => (
                  <span key={tag} className="tag">{tag}</span>
                ))}
              </div>
              <div className="diff-columns">
                <div className="diff-pane">
                  <span>Before</span>
                  <pre>{change.beforeText || 'No matching clause in the earlier version.'}</pre>
                </div>
                <div className="diff-pane">
                  <span>After</span>
                  <pre>{change.afterText || 'No matching clause in the updated version.'}</pre>
                </div>
              </div>
            </article>
          ))}
          {!filteredChanges.length && <p className="muted">No changes match the current filters.</p>}
        </div>
      </section>
    </>
  );
}

function SettingsPage({ user, form }) {
  return (
    <section className="dashboard-grid">
      <article className="glass-card dashboard-panel">
        <p className="section-label">Account</p>
        <h2>Workspace details</h2>
        <div className="settings-list">
          <div><strong>Name</strong><span>{user?.name}</span></div>
          <div><strong>Email</strong><span>{user?.email}</span></div>
          <div><strong>Account created</strong><span>{new Date(user?.createdAt || Date.now()).toLocaleDateString()}</span></div>
        </div>
      </article>

      <article className="glass-card dashboard-panel">
        <p className="section-label">Model configuration</p>
        <h2>Current defaults</h2>
        <div className="settings-list">
          <div><strong>Default model</strong><span>{form.model}</span></div>
          <div><strong>Input modes</strong><span>URL and pasted text</span></div>
          <div><strong>Provider path</strong><span>OpenRouter free by default with provider fallback</span></div>
        </div>
      </article>
    </section>
  );
}

export default function App() {
  const [locationState, setLocationState] = useState(getLocationState());
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState(emptyAuth);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [user, setUser] = useState(null);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [samples, setSamples] = useState([]);
  const [history, setHistory] = useState([]);
  const [report, setReport] = useState(null);
  const [filters, setFilters] = useState({ risk: 'all', changeType: 'all' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onPopState = () => setLocationState(getLocationState());
    window.addEventListener('popstate', onPopState);
    loadPublicSamples();
    bootstrapAuth();
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!user) return;
    const reportId = currentReportIdFromPath(locationState.path);
    if (reportId) {
      loadReport(reportId).catch(() => {});
    }
  }, [locationState.path, user]);

  async function bootstrapAuth() {
    try {
      const json = await apiFetch('/api/auth/me', { headers: {} });
      if (json.user) {
        setUser(json.user);
        setDashboardStats(json.stats);
        await loadDashboard();
        if (!locationState.path.startsWith('/app')) {
          navigateTo('/app');
        }
      }
    } catch {
      setUser(null);
    }
  }

  async function loadPublicSamples() {
    const samplesJson = await apiFetch('/api/samples', { headers: {} });
    setSamples(samplesJson.samples || []);
  }

  async function loadDashboard() {
    const [historyJson, samplesJson, meJson] = await Promise.all([
      apiFetch('/api/history', { headers: {} }),
      apiFetch('/api/samples', { headers: {} }),
      apiFetch('/api/auth/me', { headers: {} }),
    ]);
    setHistory(historyJson.reports || []);
    setSamples(samplesJson.samples || []);
    setDashboardStats(meJson.stats || null);
  }

  async function loadReport(reportId) {
    const json = await apiFetch(`/api/report/${reportId}`, { headers: {} });
    if (json.report) setReport(json.report);
  }

  async function loadSample(id) {
    const json = await apiFetch(`/api/sample/${id}`, { headers: {} });
    if (!json.sample) return;
    setForm((current) => ({
      ...current,
      previousUrl: json.sample.previousUrl,
      currentUrl: json.sample.currentUrl,
      previousText: json.sample.previousText,
      currentText: json.sample.currentText,
    }));
  }

  function updateAuthField(key, value) {
    setAuthForm((current) => ({ ...current, [key]: value }));
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const payload =
        authMode === 'signup'
          ? authForm
          : { email: authForm.email, password: authForm.password };

      const json = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setUser(json.user);
      setDashboardStats(json.stats);
      setAuthForm(emptyAuth);
      await loadDashboard();
      navigateTo('/app');
    } catch (submitError) {
      setAuthError(submitError.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    await apiFetch('/api/auth/logout', { method: 'POST', body: '{}' });
    setUser(null);
    setDashboardStats(null);
    setHistory([]);
    setReport(null);
    navigateTo('/');
  }

  async function handleCompare(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setCopied(false);
    try {
      const payload =
        form.mode === 'url'
          ? {
              mode: 'url',
              model: form.model,
              previous: { kind: 'url', value: form.previousUrl },
              current: { kind: 'url', value: form.currentUrl },
            }
          : {
              mode: 'text',
              model: form.model,
              previous: { kind: 'text', value: form.previousText },
              current: { kind: 'text', value: form.currentText },
            };

      const json = await apiFetch('/api/compare', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setReport(json.report);
      await loadDashboard();
      navigateTo(`/app/reports/${json.report.id}`);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  async function copyShareLink() {
    if (!report?.id) return;
    await navigator.clipboard.writeText(`${window.location.origin}/app/reports/${report.id}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const currentPath = user && locationState.path.startsWith('/app') ? locationState.path : '/';

  if (!user || !currentPath.startsWith('/app')) {
    return (
      <LandingPage
        authMode={authMode}
        setAuthMode={setAuthMode}
        authForm={authForm}
        updateAuthField={updateAuthField}
        handleAuthSubmit={handleAuthSubmit}
        authLoading={authLoading}
        authError={authError}
      />
    );
  }

  let content = (
    <DashboardOverview
      user={user}
      stats={dashboardStats}
      history={history}
      setRoute={navigateTo}
      setReportId={(id) => loadReport(id)}
    />
  );

  if (currentPath === '/app/new') {
    content = (
      <ComparisonWorkspace
        form={form}
        setForm={setForm}
        samples={samples}
        loadSample={loadSample}
        loading={loading}
        error={error}
        handleCompare={handleCompare}
        report={report}
        setRoute={navigateTo}
      />
    );
  } else if (currentPath === '/app/reports') {
    content = <ReportsPage history={history} setRoute={navigateTo} setReportId={(id) => loadReport(id)} />;
  } else if (currentReportIdFromPath(currentPath)) {
    content = <ReportDetail report={report} filters={filters} setFilters={setFilters} copied={copied} copyShareLink={copyShareLink} />;
  } else if (currentPath === '/app/settings') {
    content = <SettingsPage user={user} form={form} />;
  }

  return (
    <div className="dashboard-shell">
      <div className="bg-orb bg-orb-a" />
      <div className="bg-orb bg-orb-b" />

      <aside className="sidebar glass-card">
        <div className="brand-lockup compact">
          <span className="brand-mark">TW</span>
          <div>
            <strong>TermsWatch</strong>
            <p>{user?.name}</p>
          </div>
        </div>
        <AppNav currentPath={currentPath} />
        <div className="sidebar-foot">
          <div className="sidebar-note">
            <strong>Workspace</strong>
            <span>{history.length} saved reports</span>
          </div>
          <button className="secondary-button logout-button" onClick={handleLogout}>Log out</button>
        </div>
      </aside>

      <main className="main-column">{content}</main>
    </div>
  );
}
