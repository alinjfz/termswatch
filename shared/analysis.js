const RISK_RULES = [
  {
    label: 'Data sharing expansion',
    level: 'high',
    score: 3,
    keywords: ['sell', 'share', 'third party', 'partners', 'advertising', 'affiliate'],
    why: 'Broader sharing language can materially change how personal data moves outside the service.',
    tags: ['privacy', 'sharing'],
  },
  {
    label: 'Arbitration or class action',
    level: 'high',
    score: 3,
    keywords: ['arbitration', 'class action', 'jury trial', 'waive'],
    why: 'Dispute-resolution changes can limit how users or customers challenge the company.',
    tags: ['legal', 'disputes'],
  },
  {
    label: 'Auto-renewal and billing',
    level: 'high',
    score: 3,
    keywords: ['auto-renew', 'automatic renewal', 'subscription', 'billing', 'fees', 'non-refundable'],
    why: 'Payment and renewal changes can create direct financial impact for the customer.',
    tags: ['billing', 'subscription'],
  },
  {
    label: 'Liability and indemnity',
    level: 'medium',
    score: 2,
    keywords: ['liability', 'indemnify', 'damages', 'warranty'],
    why: 'Liability shifts often affect who absorbs legal or commercial risk.',
    tags: ['legal', 'liability'],
  },
  {
    label: 'Notice and consent',
    level: 'medium',
    score: 2,
    keywords: ['notice', 'consent', 'email', 'notify'],
    why: 'Notice language determines how much warning people receive before new terms take effect.',
    tags: ['communications'],
  },
  {
    label: 'Data retention and deletion',
    level: 'medium',
    score: 2,
    keywords: ['retain', 'retention', 'delete', 'deletion', 'archive'],
    why: 'Retention changes alter how long sensitive information stays available.',
    tags: ['privacy', 'retention'],
  },
  {
    label: 'Security commitments',
    level: 'low',
    score: 1,
    keywords: ['security', 'encrypt', 'breach', 'protect'],
    why: 'Security wording usually matters, but often needs surrounding context to assess severity.',
    tags: ['security'],
  },
];

function normalizeText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 64);
}

function tokenize(text) {
  return normalizeText(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function splitIntoClauses(rawText) {
  const text = normalizeText(rawText);
  return text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((section, index) => {
      const lines = section.split('\n').map((line) => line.trim()).filter(Boolean);
      const heading =
        lines[0] && lines[0].length <= 90
          ? lines[0].replace(/^[-*#\d.\s]+/, '').trim()
          : `Clause ${index + 1}`;

      return {
        id: `${index + 1}-${slugify(heading || `clause-${index + 1}`)}`,
        heading: heading || `Clause ${index + 1}`,
        text: lines.join(' '),
        tokens: tokenize(lines.join(' ')),
      };
    });
}

function jaccardSimilarity(tokensA, tokensB) {
  const a = new Set(tokensA);
  const b = new Set(tokensB);
  if (!a.size && !b.size) return 1;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function classifyRisk(text) {
  const lower = text.toLowerCase();
  const matches = RISK_RULES.filter((rule) => rule.keywords.some((keyword) => lower.includes(keyword)));
  if (!matches.length) {
    return {
      label: 'General wording change',
      level: 'low',
      score: 1,
      why: 'The language changed, but it does not strongly match a high-signal legal or privacy risk pattern.',
      tags: ['general'],
    };
  }
  return matches.sort((a, b) => b.score - a.score)[0];
}

function changeTypeLabel(kind) {
  if (kind === 'added') return 'Added clause';
  if (kind === 'removed') return 'Removed clause';
  return 'Modified clause';
}

function explainChange(kind, previousText, currentText) {
  if (kind === 'added') {
    return 'This language appears in the new version and creates a fresh obligation, permission, or disclosure.';
  }
  if (kind === 'removed') {
    return 'This language existed before but no longer appears, which may reduce a user protection or a provider commitment.';
  }

  const beforeLength = tokenize(previousText).length;
  const afterLength = tokenize(currentText).length;
  if (afterLength > beforeLength) {
    return 'The clause was broadened with additional language, suggesting expanded scope or new conditions.';
  }
  if (afterLength < beforeLength) {
    return 'The clause was tightened or shortened, which can narrow earlier promises or remove detail.';
  }
  return 'The clause changed in wording without a major size shift, so the meaning likely moved subtly rather than structurally.';
}

function buildSummary(changes, metrics) {
  if (!changes.length) {
    return [
      'No meaningful clause changes were detected between these two versions.',
      'The document structure and wording remained effectively the same.',
    ];
  }

  const bullets = [
    `${metrics.total} clause changes detected across ${metrics.modified} modified, ${metrics.added} added, and ${metrics.removed} removed sections.`,
  ];

  const highRiskChanges = changes.filter((change) => change.riskLevel === 'high').slice(0, 2);
  if (highRiskChanges.length) {
    bullets.push(
      `High-risk movement appears in ${highRiskChanges.map((change) => change.heading).join(' and ')}.`,
    );
  }

  const themes = [...new Set(changes.map((change) => change.riskLabel))].slice(0, 2);
  if (themes.length) {
    bullets.push(`The biggest themes are ${themes.join(' plus ')}.`);
  }

  bullets.push(
    metrics.highRisk
      ? 'Review the highlighted clauses before accepting the new terms, especially where rights or data use expanded.'
      : 'Most changes look low-to-medium impact, but the revised language still merits a quick human review.',
  );

  return bullets.slice(0, 5);
}

function buildWhyMatters(changes) {
  const reasons = [];
  changes.forEach((change) => {
    if (change.whyItMatters && !reasons.includes(change.whyItMatters)) {
      reasons.push(change.whyItMatters);
    }
  });
  return reasons.length ? reasons.slice(0, 5) : ['The versions are materially aligned, so no urgent follow-up is signaled.'];
}

export function runDeterministicAnalysis(previousText, currentText) {
  const previousClauses = splitIntoClauses(previousText);
  const currentClauses = splitIntoClauses(currentText);
  const usedCurrent = new Set();
  const changes = [];

  for (const previousClause of previousClauses) {
    let bestMatch = null;
    currentClauses.forEach((currentClause, index) => {
      if (usedCurrent.has(index)) return;
      const score = jaccardSimilarity(previousClause.tokens, currentClause.tokens);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { score, clause: currentClause, index };
      }
    });

    if (!bestMatch || bestMatch.score < 0.22) {
      const risk = classifyRisk(previousClause.text);
      changes.push({
        id: previousClause.id,
        heading: previousClause.heading,
        changeType: 'removed',
        changeLabel: changeTypeLabel('removed'),
        beforeText: previousClause.text,
        afterText: '',
        riskLevel: risk.level,
        riskLabel: risk.label,
        riskScore: risk.score,
        whyItMatters: risk.why,
        summary: explainChange('removed', previousClause.text, ''),
        tags: [...risk.tags, 'removed'],
        similarity: 0,
      });
      continue;
    }

    usedCurrent.add(bestMatch.index);
    if (bestMatch.score < 0.97) {
      const mergedText = `${previousClause.text} ${bestMatch.clause.text}`;
      const risk = classifyRisk(mergedText);
      changes.push({
        id: bestMatch.clause.id,
        heading: bestMatch.clause.heading,
        changeType: 'modified',
        changeLabel: changeTypeLabel('modified'),
        beforeText: previousClause.text,
        afterText: bestMatch.clause.text,
        riskLevel: risk.level,
        riskLabel: risk.label,
        riskScore: risk.score,
        whyItMatters: risk.why,
        summary: explainChange('modified', previousClause.text, bestMatch.clause.text),
        tags: [...risk.tags, 'modified'],
        similarity: Number(bestMatch.score.toFixed(2)),
      });
    }
  }

  currentClauses.forEach((currentClause, index) => {
    if (usedCurrent.has(index)) return;
    const risk = classifyRisk(currentClause.text);
    changes.push({
      id: currentClause.id,
      heading: currentClause.heading,
      changeType: 'added',
      changeLabel: changeTypeLabel('added'),
      beforeText: '',
      afterText: currentClause.text,
      riskLevel: risk.level,
      riskLabel: risk.label,
      riskScore: risk.score,
      whyItMatters: risk.why,
      summary: explainChange('added', '', currentClause.text),
      tags: [...risk.tags, 'added'],
      similarity: 0,
    });
  });

  const sortedChanges = changes.sort((a, b) => b.riskScore - a.riskScore);
  const metrics = {
    total: sortedChanges.length,
    added: sortedChanges.filter((change) => change.changeType === 'added').length,
    removed: sortedChanges.filter((change) => change.changeType === 'removed').length,
    modified: sortedChanges.filter((change) => change.changeType === 'modified').length,
    highRisk: sortedChanges.filter((change) => change.riskLevel === 'high').length,
    mediumRisk: sortedChanges.filter((change) => change.riskLevel === 'medium').length,
    lowRisk: sortedChanges.filter((change) => change.riskLevel === 'low').length,
    score: Math.min(99, sortedChanges.reduce((sum, change) => sum + change.riskScore * 9, 0)),
  };

  return {
    overview: {
      headline:
        metrics.highRisk > 0
          ? `${metrics.highRisk} high-risk changes need review`
          : metrics.total > 0
            ? 'Changes detected with low-to-medium materiality'
            : 'No material changes detected',
      summaryBullets: buildSummary(sortedChanges, metrics),
      whyMatters: buildWhyMatters(sortedChanges),
      disclaimer: 'Informational output only. TermsWatch surfaces change intelligence and risk signals, not legal advice.',
      confidence: metrics.total ? 'medium' : 'high',
      modelMode: 'deterministic fallback',
    },
    metrics,
    changes: sortedChanges,
  };
}
