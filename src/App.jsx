import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabase.js';

const DEFAULT_MODEL = 'default';
const API_BASE = '';

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

function formatReportSources(report) {
  const previousTitle = report?.sources?.previous?.title;
  const currentTitle = report?.sources?.current?.title;
  const isSingle = report?.overview?.comparisonKind === 'single';

  if (isSingle) {
    const title = previousTitle !== 'Not provided' ? previousTitle : currentTitle;
    return title || 'Submitted policy';
  }

  if (previousTitle && currentTitle && previousTitle !== 'Not provided' && currentTitle !== 'Not provided') {
    return `${previousTitle} → ${currentTitle}`;
  }

  return currentTitle || previousTitle || 'Policy review';
}

function hasCompareInput(form) {
  if (form.mode === 'url') {
    return Boolean(form.previousUrl.trim() && form.currentUrl.trim());
  }

  return Boolean(form.previousText.trim() && form.currentText.trim());
}

function hasPolicyInput(form) {
  if (form.mode === 'url') {
    return Boolean(form.previousUrl.trim() || form.currentUrl.trim());
  }

  return Boolean(form.previousText.trim() || form.currentText.trim());
}

function formatAuthError(message, mode) {
  const normalized = String(message || '').trim();

  if (normalized === 'Invalid login credentials' || normalized === 'Invalid email or password.') {
    return 'We could not sign you in with that email and password. Check your credentials or create a new account.';
  }

  if (normalized.includes('Password should be at least') || normalized.includes('String must contain at least 8 character')) {
    return mode === 'signup'
      ? 'Use a password with at least 6 characters to create the account.'
      : 'Enter the full password for this workspace account.';
  }

  if (normalized.includes('Invalid email') || normalized.includes('Unable to validate email address')) {
    return 'Enter a valid email address for this workspace account.';
  }

  if (normalized.includes('already registered') || normalized === 'An account with that email already exists.') {
    return 'That email already has a TermsWatch account. Try logging in instead.';
  }

  if (normalized.includes('Email not confirmed')) {
    return 'Check your email to confirm your account, then sign in.';
  }

  return normalized || 'Authentication failed. Please try again.';
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

function BrandMark() {
  return <img className="brand-mark" src="/termswatch-mark.svg" alt="" aria-hidden="true" />;
}

async function apiFetch(path, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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

function AuthModal({
  open,
  onClose,
  authMode,
  setAuthMode,
  authForm,
  updateAuthField,
  handleAuthSubmit,
  authLoading,
  authError,
}) {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="auth-modal-root" role="presentation" onClick={onClose}>
      <div
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="auth-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="auth-modal-body">
          <div className="auth-card-intro">
            <p className="section-label">{authMode === 'signup' ? 'Get started' : 'Welcome back'}</p>
            <h2 id="auth-modal-title">{authMode === 'signup' ? 'Open your workspace' : 'Sign in to your workspace'}</h2>
            <p className="auth-copy">Private report history, exports, and direct report links — all in one place.</p>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === 'signup' && (
              <label className="field">
                <span>Full name</span>
                <input
                  value={authForm.name}
                  onChange={(event) => updateAuthField('name', event.target.value)}
                  placeholder="Jordan Lee"
                  autoComplete="name"
                />
              </label>
            )}
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => updateAuthField('email', event.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => updateAuthField('password', event.target.value)}
                placeholder="At least 8 characters"
                autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
              />
            </label>
            <button className="primary-button auth-button" disabled={authLoading}>
              {authLoading ? 'Working…' : authMode === 'signup' ? 'Create account' : 'Log in'}
            </button>
            {authError && <div className="error-banner">{authError}</div>}
          </form>

          <div className="auth-footer">
            <span>{authMode === 'signup' ? 'Already have an account?' : 'Need an account?'}</span>
            <button
              type="button"
              className="inline-button"
              onClick={() => setAuthMode((current) => (current === 'signup' ? 'login' : 'signup'))}
            >
              {authMode === 'signup' ? 'Log in' : 'Sign up'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function LandingVisual() {
  return (
    <div className="landing-visual" aria-hidden="true">
      <div className="visual-aura" />
      <div className="visual-ring visual-ring-a" />
      <div className="visual-ring visual-ring-b" />
      <div className="visual-doc visual-doc-back">
        <div className="visual-line" />
        <div className="visual-line visual-line-short" />
        <div className="visual-line" />
        <div className="visual-line visual-line-short" />
      </div>
      <div className="visual-doc visual-doc-front">
        <div className="visual-doc-header">
          <span className="visual-dot" />
          <span>Policy comparison</span>
        </div>
        <div className="visual-line visual-line-muted" />
        <div className="visual-line visual-line-removed" />
        <div className="visual-line visual-line-added" />
        <div className="visual-line visual-line-short" />
        <div className="visual-flag">Data sharing · High risk</div>
      </div>
      <div className="visual-float visual-float-a">
        <strong>91</strong>
        <span>Risk score</span>
      </div>
      <div className="visual-float visual-float-b">
        <strong>3</strong>
        <span>Changes flagged</span>
      </div>
    </div>
  );
}

function LandingPage({ authMode, setAuthMode, authForm, updateAuthField, handleAuthSubmit, authLoading, authError, setAuthError }) {
  const [authModalOpen, setAuthModalOpen] = useState(false);

  function openAuthModal(mode = 'signup') {
    setAuthMode(mode);
    setAuthError('');
    setAuthModalOpen(true);
  }

  function closeAuthModal() {
    setAuthModalOpen(false);
  }

  const workflow = [
    {
      step: '01',
      title: 'Ingest both versions',
      detail: 'Paste text or point at live policy URLs.',
    },
    {
      step: '02',
      title: 'Review the diff',
      detail: 'Clause-level changes, ranked by material risk.',
    },
    {
      step: '03',
      title: 'Share the evidence',
      detail: 'Save, export, and reopen when decisions need proof.',
    },
  ];

  return (
    <div className="site-shell landing-site">
      <div className="landing-backdrop" aria-hidden="true">
        <div className="landing-glow landing-glow-a" />
        <div className="landing-glow landing-glow-b" />
        <div className="landing-glow landing-glow-c" />
      </div>

      <header className="landing-topbar">
        <div className="brand-lockup">
          <BrandMark />
          <div>
            <strong>TermsWatch</strong>
            <p>Policy change intelligence</p>
          </div>
        </div>
        <nav className="landing-nav" aria-label="Landing">
          <a href="#showcase">Product</a>
          <a href="#workflow">Workflow</a>
        </nav>
        <div className="top-actions">
          <button className="nav-button" onClick={() => openAuthModal('login')}>
            Log in
          </button>
          <button className="primary-button" onClick={() => openAuthModal('signup')}>
            Start free
          </button>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero landing-hero-open">
          <div className="landing-hero-copy reveal-up">
            <p className="section-label">Policy change intelligence</p>
            <h1>
              Policy changes,
              <em> made legible.</em>
            </h1>
            <p className="hero-lead">
              Compare terms and vendor policies in minutes — not days. Clause-level diffs, risk-ranked findings,
              and plain-language summaries in one private workspace.
            </p>
            <div className="hero-cta-row">
              <button className="primary-button" onClick={() => openAuthModal('signup')}>
                Create workspace
              </button>
              <button
                className="secondary-button"
                onClick={() => document.getElementById('showcase')?.scrollIntoView({ behavior: 'smooth' })}
              >
                See the product
              </button>
            </div>
            <p className="hero-footnote">For legal ops, privacy, procurement, compliance, and vendor risk teams.</p>
          </div>

          <div className="landing-hero-visual reveal-up reveal-delay-1">
            <LandingVisual />
          </div>
        </section>

        <section id="showcase" className="landing-showcase-band reveal-up">
          <div className="landing-section-head">
            <p className="section-label">The review packet</p>
            <h2>Everything your team needs in one clear surface.</h2>
            <p className="section-lead">
              Executive summary up top. Changed clauses below. Risk labels and before/after text where it matters.
            </p>
          </div>

          <div className="preview-frame preview-frame-hero">
            <div className="preview-chrome">
              <span className="preview-dot preview-dot-a" />
              <span className="preview-dot preview-dot-b" />
              <span className="preview-dot preview-dot-c" />
              <span className="preview-chrome-title">Vendor privacy policy — comparison report</span>
            </div>
            <div className="preview-shell">
              <div className="preview-topline">
                <span className="status-dot" />
                <strong>Material changes detected</strong>
                <span className="preview-score">Score 91</span>
              </div>
              <div className="preview-summary">
                <p>3 high-risk changes need review</p>
                <span>Broader data sharing, new dispute language, and auto-renewal terms.</span>
              </div>
              <div className="preview-columns">
                <div className="preview-panel preview-panel-before">
                  <span>Before</span>
                  <p>We share data with service providers only to support operations.</p>
                </div>
                <div className="preview-panel preview-panel-after">
                  <span>After</span>
                  <p>We may share personal information with affiliates, analytics, and advertising partners.</p>
                </div>
              </div>
              <div className="preview-tags">
                <span className="risk-chip risk-high">Data sharing expansion</span>
                <span className="tag">privacy</span>
                <span className="tag">modified</span>
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" className="landing-workflow-band reveal-up">
          <div className="landing-section-head landing-section-head-left">
            <p className="section-label">How it works</p>
            <h2>Three steps from raw policy to review decision.</h2>
          </div>
          <div className="workflow-strip">
            {workflow.map((item) => (
              <article key={item.step} className="workflow-card">
                <span className="workflow-number">{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-trust-band reveal-up">
          <div className="trust-visual" aria-hidden="true">
            <div className="trust-visual-inner">
              <span className="trust-shield" />
            </div>
          </div>
          <div className="trust-copy">
            <p className="section-label">Built for production</p>
            <h2>Private, server-side, and reliable when models are not.</h2>
            <ul className="trust-list">
              <li>Reports stay scoped to your authenticated workspace.</li>
              <li>URL fetching and extraction run on the server, not in the browser.</li>
              <li>Deterministic comparison still delivers a full packet if AI enhancement is down.</li>
            </ul>
          </div>
        </section>

        <section className="landing-cta landing-cta-minimal reveal-up">
          <h2>Ready to review your next policy change?</h2>
          <button className="primary-button" onClick={() => openAuthModal('signup')}>
            Create workspace
          </button>
        </section>
      </main>

      <AuthModal
        open={authModalOpen}
        onClose={closeAuthModal}
        authMode={authMode}
        setAuthMode={setAuthMode}
        authForm={authForm}
        updateAuthField={updateAuthField}
        handleAuthSubmit={handleAuthSubmit}
        authLoading={authLoading}
        authError={authError}
      />

      <footer className="landing-footer">
        <div className="brand-lockup compact">
          <BrandMark />
          <div>
            <strong>TermsWatch</strong>
            <p>Policy change intelligence</p>
          </div>
        </div>
        <p className="landing-footer-note">
          TermsWatch explains policy changes for review workflows. It does not provide legal advice.
        </p>
      </footer>
    </div>
  );
}

function DashboardVisual({ comparisons, highRisk }) {
  return (
    <div className="dashboard-visual" aria-hidden="true">
      <div className="dashboard-visual-aura" />
      <div className="dashboard-visual-ring" />
      <div className="dashboard-visual-stack">
        <div className="dashboard-visual-sheet dashboard-visual-sheet-back" />
        <div className="dashboard-visual-sheet dashboard-visual-sheet-mid" />
        <div className="dashboard-visual-sheet dashboard-visual-sheet-front">
          <span className="dashboard-visual-label">Latest review</span>
          <div className="dashboard-visual-line" />
          <div className="dashboard-visual-line dashboard-visual-line-accent" />
          <div className="dashboard-visual-line dashboard-visual-line-short" />
        </div>
      </div>
      <div className="dashboard-visual-float dashboard-visual-float-a">
        <strong>{comparisons}</strong>
        <span>Comparisons</span>
      </div>
      <div className="dashboard-visual-float dashboard-visual-float-b">
        <strong>{highRisk}</strong>
        <span>High-risk flags</span>
      </div>
    </div>
  );
}

function DashboardOverview({ user, stats, history, setRoute, setReportId }) {
  const recent = history.slice(0, 5);
  const latest = history[0];
  const firstName = user?.name?.split(' ')[0] || 'there';
  const totals = workspaceStats(stats, history);

  return (
    <div className="dashboard-home">
      <section className="dashboard-welcome">
        <div className="dashboard-welcome-copy reveal-up">
          <p className="section-label">Workspace</p>
          <h1>
            Welcome back,
            <em> {firstName}.</em>
          </h1>
          <p className="hero-lead">
            Compare policy versions, surface material risk, and keep every review packet saved for when decisions need evidence.
          </p>
          <div className="hero-cta-row">
            <button className="primary-button" onClick={() => setRoute('/app/new')}>
              New comparison
            </button>
            <button className="secondary-button" onClick={() => setRoute('/app/reports')}>
              View all reports
            </button>
          </div>
          {latest ? (
            <p className="hero-footnote">
              Latest report · {new Date(latest.createdAt).toLocaleDateString()} · {latest.metrics.highRisk} high-risk changes
            </p>
          ) : (
            <p className="hero-footnote">No comparisons yet — run your first review to populate the workspace.</p>
          )}
        </div>

        <div className="dashboard-welcome-visual reveal-up reveal-delay-1">
          <DashboardVisual
            comparisons={totals[0]?.value ?? 0}
            highRisk={totals[1]?.value ?? 0}
          />
        </div>
      </section>

      <section className="dashboard-stats-strip reveal-up">
        {totals.map((item) => (
          <article key={item.label} className="dashboard-stat">
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </article>
        ))}
      </section>

      <section className="dashboard-recent-band reveal-up">
        <div className="dashboard-section-head">
          <div>
            <p className="section-label">Recent activity</p>
            <h2>{recent.length ? 'Your latest review packets' : 'Your workspace is ready'}</h2>
          </div>
          {recent.length > 0 && (
            <button type="button" className="secondary-button" onClick={() => setRoute('/app/reports')}>
              See all
            </button>
          )}
        </div>

        {recent.length > 0 ? (
          <div className="dashboard-report-list">
            {recent.map((item) => (
              <button
                key={item.id}
                type="button"
                className="dashboard-report-row"
                onClick={() => {
                  setReportId(item.id);
                  setRoute(`/app/reports/${item.id}`);
                }}
              >
                <div className="dashboard-report-main">
                  <strong>{item.headline}</strong>
                  <span>
                    {formatReportSources(item)}
                  </span>
                </div>
                <div className="dashboard-report-meta">
                  <span className={classNames('risk-chip', item.metrics.highRisk > 0 ? 'risk-high' : 'risk-low')}>
                    {item.metrics.highRisk > 0 ? `${item.metrics.highRisk} high-risk` : 'No high-risk'}
                  </span>
                  <span>{item.metrics.total} changes</span>
                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="dashboard-empty">
            <div className="dashboard-empty-visual" aria-hidden="true">
              <div className="dashboard-empty-doc" />
              <div className="dashboard-empty-doc dashboard-empty-doc-offset" />
            </div>
            <div className="dashboard-empty-copy">
              <h3>Run your first comparison</h3>
              <p>Load a sample or paste two policy versions to generate your first review packet.</p>
              <button type="button" className="primary-button" onClick={() => setRoute('/app/new')}>
                Open comparison workspace
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
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
  aiStatus,
}) {
  const featuredSamples = samples.slice(0, 3);
  const isComparison = hasCompareInput(form);

  return (
    <section className="workspace-page">
      <div className="workspace-page-head">
        <div>
          <p className="section-label">New comparison</p>
          <h1 className="workspace-title">Run a policy review</h1>
          <p className="hero-lead">
            Paste a policy to flag risky clauses, or add a second version to compare before and after.
          </p>
        </div>
        <div className={classNames('ai-status-card', aiStatus?.configured ? 'is-live' : 'is-fallback')}>
          <span className="status-dot" />
          <div>
            <strong>{aiStatus?.configured ? 'Live AI enabled' : 'Deterministic mode'}</strong>
            <p>{aiStatus?.message || 'Checking model configuration…'}</p>
          </div>
        </div>
      </div>

      <div className="workspace-grid">
        <form className="glass-card composer-card" onSubmit={handleCompare}>
          <div className="composer-stack">
            <div className="card-heading composer-heading">
              <div>
                <p className="section-label">Comparison engine</p>
                <h2>Configure your inputs</h2>
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

            <div className="composer-section">
              <p className="section-label">Quick start samples</p>
              <div className="sample-row">
                {featuredSamples.map((sample) => (
                  <button key={sample.id} type="button" className="sample-card" onClick={() => loadSample(sample.id)}>
                    <strong>{sample.name}</strong>
                    <span>{sample.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="composer-section">
              <label className="field">
                <span>Model</span>
                <input
                  value={form.model}
                  placeholder="default"
                  onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
                />
              </label>
            </div>

            {form.mode === 'url' ? (
              <div className="composer-section field-grid version-grid">
                <label className="field field-version field-version-before">
                  <span className="version-label version-label-before">Policy URL</span>
                  <input
                    type="url"
                    value={form.previousUrl}
                    placeholder="https://example.com/privacy-policy"
                    onChange={(event) => setForm((current) => ({ ...current, previousUrl: event.target.value }))}
                  />
                </label>
                <label className="field field-version field-version-after field-version-optional">
                  <span className="version-label version-label-after">Compare against (optional)</span>
                  <input
                    type="url"
                    value={form.currentUrl}
                    placeholder="https://example.com/privacy-policy-v2"
                    onChange={(event) => setForm((current) => ({ ...current, currentUrl: event.target.value }))}
                  />
                </label>
              </div>
            ) : (
              <div className="composer-section version-stack">
                <label className="field field-version field-version-before">
                  <span className="version-label version-label-before">Policy text</span>
                  <textarea
                    rows="14"
                    value={form.previousText}
                    placeholder="Paste terms, privacy policy, or vendor contract language here."
                    onChange={(event) => setForm((current) => ({ ...current, previousText: event.target.value }))}
                  />
                </label>
                <label className="field field-version field-version-after field-version-optional">
                  <span className="version-label version-label-after">Compare against (optional)</span>
                  <textarea
                    rows="8"
                    value={form.currentText}
                    placeholder="Optional — paste an updated version to compare clause by clause."
                    onChange={(event) => setForm((current) => ({ ...current, currentText: event.target.value }))}
                  />
                </label>
              </div>
            )}

            <div className="composer-section toolbar">
              <button className="primary-button" disabled={loading || !hasPolicyInput(form)}>
                {loading ? 'Analyzing…' : isComparison ? 'Run comparison' : 'Analyze policy'}
              </button>
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
            <p className="muted small composer-footnote">Server-side URL fetch when available. Deterministic comparison remains available if model enhancement fails.</p>
            {error && <div className="error-banner">{error}</div>}
          </div>
        </form>

        <section className="glass-card run-card">
          <div className="card-heading">
            <div>
              <p className="section-label">Pipeline</p>
              <h2>Run status</h2>
            </div>
            <span className="pill">{loading ? 'Working' : report ? 'Ready' : 'Idle'}</span>
          </div>
          <ol className="run-log">
            {(report?.runLog || [
              { title: 'Awaiting input', detail: 'Enter URLs or paste both policy versions.' },
              { title: 'Clause diff', detail: 'TermsWatch segments text and detects added, removed, and modified clauses.' },
              { title: 'Risk ranking', detail: 'Clause changes are ranked by material risk for review.' },
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
      </div>
    </section>
  );
}

function ReportsPage({ history, setRoute, setReportId }) {
  return (
    <section className="glass-card dashboard-panel">
      <div className="card-heading">
        <div>
          <p className="section-label">Reports archive</p>
          <h2>Saved comparisons and decision history</h2>
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
              <span>{formatReportSources(item)}</span>
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
      <section className="glass-card report-header">
        <div>
          <p className="section-label">Report detail</p>
          <h1 className="report-title">{report.overview.headline}</h1>
          <p className="muted">{formatReportSources(report)}</p>
        </div>
        <div className="report-meta-grid">
          <div className="metric-tile">
            <span>Generated</span>
            <strong>{new Date(report.createdAt).toLocaleDateString()}</strong>
          </div>
          <div className="metric-tile">
            <span>Model mode</span>
            <strong>{report.overview.modelMode}</strong>
          </div>
        </div>
      </section>

      <section className="summary-grid">
        <article className="glass-card">
          <div className="card-heading">
            <div>
              <p className="section-label">Executive output</p>
              <h2>Decision summary</h2>
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
              <p className="section-label">Controls</p>
              <h2>Share, export, and audit</h2>
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
              <option value="review">Flagged clauses</option>
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
              <div className={classNames('diff-columns', change.changeType === 'review' && 'diff-columns-single')}>
                {change.changeType !== 'review' && (
                  <div className="diff-pane diff-pane-before">
                    <span className="diff-pane-label diff-pane-label-before">Before</span>
                    <pre>{change.beforeText || 'No matching clause in the earlier version.'}</pre>
                  </div>
                )}
                {change.changeType !== 'review' && <div className="diff-arrow" aria-hidden="true">→</div>}
                <div className="diff-pane diff-pane-after">
                  <span className="diff-pane-label diff-pane-label-after">
                    {change.changeType === 'review' ? 'Clause text' : 'After'}
                  </span>
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

function SettingsPage({ user }) {
  return (
    <section className="dashboard-grid">
      <article className="glass-card dashboard-panel">
        <p className="section-label">Profile</p>
        <h2>Account and workspace identity</h2>
        <div className="settings-list">
          <div><strong>Name</strong><span>{user?.name}</span></div>
          <div><strong>Email</strong><span>{user?.email}</span></div>
          <div><strong>Account created</strong><span>{new Date(user?.createdAt || Date.now()).toLocaleDateString()}</span></div>
          <div><strong>Workspace mode</strong><span>Private individual workspace</span></div>
        </div>
      </article>

      <article className="glass-card dashboard-panel">
        <p className="section-label">Security</p>
        <h2>Workspace operating model</h2>
        <div className="settings-list">
          <div><strong>History scope</strong><span>Reports are account-scoped</span></div>
          <div><strong>URL retrieval</strong><span>Server-side fetch and extraction</span></div>
          <div><strong>Fallback mode</strong><span>Deterministic comparison remains available</span></div>
          <div><strong>Session model</strong><span>Cookie-based authenticated workspace access</span></div>
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
  const [aiStatus, setAiStatus] = useState(null);

  useEffect(() => {
    const onPopState = () => setLocationState(getLocationState());
    window.addEventListener('popstate', onPopState);
    loadPublicSamples();
    loadAIStatus();
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
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user) {
      const u = session.user;
      setUser({
        id: u.id,
        name: u.user_metadata?.name || u.email?.split('@')[0] || '',
        email: u.email,
        createdAt: u.created_at,
      });
      await loadDashboard();
      if (!locationState.path.startsWith('/app')) {
        navigateTo('/app');
      }
    }

    supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        if (event === 'SIGNED_OUT' || !session) {
          setUser(null);
          setDashboardStats(null);
          setHistory([]);
          setReport(null);
          navigateTo('/');
          return;
        }
        if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          const u = session.user;
          setUser({
            id: u.id,
            name: u.user_metadata?.name || u.email?.split('@')[0] || '',
            email: u.email,
            createdAt: u.created_at,
          });
        }
      })();
    });
  }

  async function loadPublicSamples() {
    const samplesJson = await apiFetch('/api/samples', { headers: {} });
    setSamples(samplesJson.samples || []);
  }

  async function loadAIStatus() {
    try {
      const json = await apiFetch('/api/health', { headers: {} });
      setAiStatus(json.ai || null);
    } catch {
      setAiStatus(null);
    }
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
      mode: json.sample.recommendedMode || current.mode,
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
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: authForm.email.trim(),
          password: authForm.password,
          options: { data: { name: authForm.name.trim() } },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authForm.email.trim(),
          password: authForm.password,
        });
        if (error) throw error;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        const u = session.user;
        setUser({
          id: u.id,
          name: u.user_metadata?.name || u.email?.split('@')[0] || '',
          email: u.email,
          createdAt: u.created_at,
        });
      }

      setAuthForm(emptyAuth);
      await loadDashboard();
      navigateTo('/app');
    } catch (submitError) {
      setAuthError(formatAuthError(submitError?.message, authMode));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setDashboardStats(null);
    setHistory([]);
    setReport(null);
    navigateTo('/');
  }

  async function handleCompare(event) {
    event.preventDefault();
    if (!hasPolicyInput(form)) {
      setError('Paste policy text or enter a URL to analyze.');
      return;
    }

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
        setAuthError={setAuthError}
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
        aiStatus={aiStatus}
      />
    );
  } else if (currentPath === '/app/reports') {
    content = <ReportsPage history={history} setRoute={navigateTo} setReportId={(id) => loadReport(id)} />;
  } else if (currentReportIdFromPath(currentPath)) {
    content = <ReportDetail report={report} filters={filters} setFilters={setFilters} copied={copied} copyShareLink={copyShareLink} />;
  } else if (currentPath === '/app/settings') {
    content = <SettingsPage user={user} />;
  }

  return (
    <div className="dashboard-shell">
      <div className="bg-orb bg-orb-a" />
      <div className="bg-orb bg-orb-b" />

      <aside className="sidebar glass-card">
        <div className="brand-lockup compact">
          <BrandMark />
          <div>
            <strong>TermsWatch</strong>
            <p>{user?.name}</p>
          </div>
        </div>
        <AppNav currentPath={currentPath} />
        <div className="sidebar-foot">
          <div className="sidebar-note">
            <strong>Workspace</strong>
            <span>{history.length} saved reports · {dashboardStats?.highRiskFlags ?? 0} high-risk flags tracked</span>
          </div>
          <button className="secondary-button logout-button" onClick={handleLogout}>Log out</button>
        </div>
      </aside>

      <main className="main-column">{content}</main>
    </div>
  );
}
