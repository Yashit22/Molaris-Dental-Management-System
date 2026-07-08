// Shared dosage & duration option lists used by the prescription panel, the
// Settings medicine catalog forms, and the medicines starter library. Any
// medicine's default_dosage / default_duration MUST be one of these exact
// strings so it pre-fills the fixed <select>s cleanly.

export const DOSAGE_OPTIONS = [
  '1-0-0', '0-0-1', '0-1-0',
  '1-1-0', '0-1-1', '1-0-1',
  '1-1-1', 'SOS', 'Once daily',
  'Twice daily', 'Thrice daily',
];

export const DURATION_OPTIONS = [
  '1 day', '2 days', '3 days', '4 days', '5 days',
  '7 days', '10 days', '14 days', '1 month',
];
