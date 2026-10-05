import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Button } from '../components/ui';
import { Link } from 'react-router-dom';

export default function Pending() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-3 text-3xl">⏳</div>
        <h1 className="text-lg font-bold text-slate-50">Account pending</h1>
        <p className="mt-2 text-sm text-slate-400">
          Your account has been created, but hasn't been linked to an agency yet. Ask your import
          agent to link your email address, then sign back in.
        </p>
        <div className="mt-6">
          <Link to="/agency/setup" className="btn-primary mb-3">I run an agency — create my workspace</Link>
          <Button variant="ghost" onClick={() => signOut(auth)}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
