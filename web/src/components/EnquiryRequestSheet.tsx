import { createPortal } from 'react-dom';
import { Button } from './ui';

export default function EnquiryRequestSheet({ text, onClose }: { text: string; onClose: () => void }) {
  return createPortal(
    <div className="print-overlay fixed inset-0 z-[100] overflow-auto bg-white p-6 text-black">
      <section className="print-sheet mx-auto max-w-2xl break-words">
        <div className="no-print mb-6 flex gap-3">
          <Button onClick={() => window.print()}>Print / save PDF</Button>
          <Button variant="ghost" onClick={onClose}>Close document</Button>
        </div>
        <p className="whitespace-pre-wrap">{text}</p>
        <p className="mt-6 text-sm">Prepared {new Date().toLocaleString()} on Radbit Auto. Send it to your dealer on WhatsApp or email to speed up the availability check and quotation.</p>
      </section>
    </div>,
    document.body
  );
}
