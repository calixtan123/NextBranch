import { Suspense } from 'react';
import Home from '@/components/Home';
/** Search parameters are consumed client-side, so the shell supplies the required boundary. */
export default function Page() { return <Suspense fallback={null}><Home /></Suspense>; }
