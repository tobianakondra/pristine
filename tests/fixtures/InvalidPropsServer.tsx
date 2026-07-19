// @ts-nocheck
import { ClientButton } from './ClientButton';

export function InvalidPropsServer() {
  // EXPECTED VIOLATION: passing event handlers and inline functions from a Server Component
  return (
    <div>
      <ClientButton onClick={() => console.log('Clicked!')} />
      <ClientButton onChange={(e) => console.log(e)} />
    </div>
  );
}
