export function getContextNode(pathname) {
  if (pathname === '/' || pathname.startsWith('/treatment')) return 'ctx-appointments';
  if (pathname.startsWith('/patients')) return 'ctx-patients';
  if (pathname.startsWith('/invoices')) return 'ctx-billing';
  if (pathname.startsWith('/lab')) return 'ctx-lab';
  if (pathname.startsWith('/whatsapp')) return 'ctx-whatsapp';
  if (pathname.startsWith('/insights')) return 'ctx-reports';
  if (pathname.startsWith('/settings')) return 'ctx-settings';
  return 'root';
}
