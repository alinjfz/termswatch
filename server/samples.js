export const demoUrlPair = {
  previous: 'https://demo.termswatch.app/privacy/v1',
  current: 'https://demo.termswatch.app/privacy/v2',
};

export const samplePolicies = [
  {
    id: 'privacy-demo',
    name: 'Privacy Policy Demo',
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
