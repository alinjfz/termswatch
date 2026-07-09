export const demoUrlPair = {
  previous: 'https://demo.termswatch.app/privacy/v1',
  current: 'https://demo.termswatch.app/privacy/v2',
};

export const samplePolicies = [
  {
    id: 'privacy-demo',
    name: 'Privacy Policy Demo',
    category: 'Vendor privacy policy',
    recommendedMode: 'url',
    expectedOutcome: 'High-risk sharing and dispute changes',
    description: 'Shows privacy sharing, retention, arbitration, and billing changes.',
    previousUrl: demoUrlPair.previous,
    currentUrl: demoUrlPair.current,
    previousText: `Privacy Policy

Data We Collect
We collect account details, basic usage information, and device identifiers needed to operate the service.

How We Use Data
We use personal information to provide the service, secure accounts, and send service updates.

Sharing Information
We do not sell personal information. We share data with service providers only to support operations on our behalf.

Retention
We keep account data for as long as the account remains active and remove deleted account data within 30 days.

Disputes
Disputes may be brought in local courts where required by law.
`,
    currentText: `Privacy Policy

Data We Collect
We collect account details, device identifiers, approximate location, and product interaction data to operate and improve the service.

How We Use Data
We use personal information to provide the service, personalize the product experience, train internal models, and send service updates.

Sharing Information
We may share personal information with affiliates, analytics partners, and advertising partners to measure campaigns and improve recommendations. We do not sell personal information for money.

Retention
We may retain account data for as long as needed for legal, security, analytics, and backup purposes, even after account closure.

Dispute Resolution
Any dispute will be resolved through binding arbitration on an individual basis, and users waive participation in class actions.

Billing
Paid plans automatically renew unless canceled before the renewal date. Fees are non-refundable except where required by law.
`,
  },
  {
    id: 'saas-terms-demo',
    name: 'SaaS Terms Demo',
    category: 'Commercial terms',
    recommendedMode: 'text',
    expectedOutcome: 'Liability and renewal risk increases',
    description: 'Useful for testing text mode, limitation of liability changes, and termination language.',
    previousUrl: 'https://demo.termswatch.app/terms/v1',
    currentUrl: 'https://demo.termswatch.app/terms/v2',
    previousText: `Terms of Service

Fees
Customers are billed monthly based on active seats. Fees are payable within 30 days of invoice.

Renewal
Subscriptions renew for successive one-month terms unless either party gives 15 days' notice before renewal.

Suspension
We may suspend access for non-payment after giving reasonable notice and an opportunity to cure.

Liability
Our aggregate liability is limited to the fees paid under this agreement during the prior 12 months.

Termination
Either party may terminate for material breach if the breach remains uncured for 30 days after written notice.
`,
    currentText: `Terms of Service

Fees
Customers are billed annually in advance based on committed seats. Fees are due upon invoice and are non-refundable except where required by law.

Renewal
Subscriptions automatically renew for additional 12-month terms unless canceled at least 45 days before renewal.

Suspension
We may suspend access immediately for suspected misuse, security concerns, or non-payment.

Liability
Our aggregate liability is limited to the lesser of fees paid in the prior three months or $500.

Termination
We may terminate the service immediately for policy violations. Customers may terminate only at the end of the current subscription term.
`,
  },
  {
    id: 'security-notice-demo',
    name: 'Security Notice Demo',
    category: 'Security and incident notice',
    recommendedMode: 'text',
    expectedOutcome: 'Shorter notice windows and broader disclosure rights',
    description: 'Good for checking clause extraction on a smaller document and reviewing incident-response language.',
    previousUrl: 'https://demo.termswatch.app/security/v1',
    currentUrl: 'https://demo.termswatch.app/security/v2',
    previousText: `Security Notice

Incident Notification
If we confirm unauthorized access to customer data, we will notify affected customers without undue delay and no later than 72 hours after confirmation.

Subprocessors
We maintain a list of subprocessors and provide 15 days' notice before adding a new subprocessor.

Audit Support
Customers may request one security questionnaire response per year and a copy of our most recent SOC 2 report.
`,
    currentText: `Security Notice

Incident Notification
If we suspect or confirm unauthorized access to customer data, we may notify affected customers as soon as reasonably practicable, taking into account the needs of law enforcement and remediation.

Subprocessors
We may engage new subprocessors at any time and will update our list periodically.

Audit Support
Customers may review summary security materials made available in our trust center. We may decline repeated or overly burdensome requests.
`,
  },
];

export function getSampleById(id) {
  return samplePolicies.find((sample) => sample.id === id);
}

export function resolveDemoUrl(url) {
  for (const sample of samplePolicies) {
    if (sample.previousUrl === url) {
      return { title: `${sample.name} (previous)`, text: sample.previousText, sampleId: sample.id };
    }
    if (sample.currentUrl === url) {
      return { title: `${sample.name} (current)`, text: sample.currentText, sampleId: sample.id };
    }
  }
  return null;
}
