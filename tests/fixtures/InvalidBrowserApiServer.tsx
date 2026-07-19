// @ts-nocheck
export function InvalidBrowserApiServer() {
  // EXPECTED VIOLATION: browser API usage inside a Server Component
  const token = localStorage.getItem('token');
  const width = window.innerWidth;

  return <div>Server Component using {token} ({width}px)</div>;
}
