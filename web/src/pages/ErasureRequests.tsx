import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card } from '../components/ui';

interface ErasureRequest {
  id: string;
  status: string;
  note: string;
  createdAt: number;
}

export default function ErasureRequests() {
  const [rows, setRows] = useState<ErasureRequest[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    api.listErasureRequests({})
      .then((data) => { if (active) setRows(data.requests); })
      .catch((e) => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [refresh]);

  async function resolve(id: string, decision: 'fulfilled' | 'rejected') {
    setBusy(id);
    setError('');
    setNotice('');
    try {
      await api.resolveErasureRequest({ requestId: id, decision });
      setNotice(decision === 'fulfilled' ? 'Marked as fulfilled.' : 'Marked as rejected — record your reason.');
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  return (
    <Card>
      <h2 className="section-title">Deletion requests</h2>
      <p className="mb-3 text-sm text-slate-400">Customers may ask for their data to be deleted. Check whether tax, customs or financial rules require you to keep a record before you decide.</p>
      {error ? <p role="alert" className="mb-2">{error}</p> : null}
      {notice ? <p role="status" className="mb-2 text-sm">{notice}</p> : null}
      {rows.length === 0 ? <p className="text-sm">No deletion requests.</p> : null}
      {rows.map((row) => (
        <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm">
          <span>
            {new Date(row.createdAt).toLocaleDateString()} · {row.status}
            {row.note ? ` · ${row.note}` : ''}
          </span>
          {row.status === 'pending' ? (
            <span className="flex gap-2">
              <Button variant="ghost" loading={busy === row.id} onClick={() => resolve(row.id, 'fulfilled')}>Fulfilled</Button>
              <Button variant="ghost" loading={busy === row.id} onClick={() => resolve(row.id, 'rejected')}>Cannot delete</Button>
            </span>
          ) : null}
        </div>
      ))}
    </Card>
  );
}
