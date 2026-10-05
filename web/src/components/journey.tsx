import { STAGES, stageLabel } from '../lib/types';
import { stagePhase } from './ui';
import { useEffect, useRef } from 'react';

interface RailStage {
  key: string;
  label: string;
}

/**
 * Signature element: the import journey as a waypoint rail.
 * Answers "where is my vehicle / what is next" at a glance (5-second rule).
 */
export default function JourneyRail({
  currentKey,
  stages,
}: {
  currentKey: string;
  stages?: RailStage[];
}) {
  const list = stages && stages.length > 0 ? stages : STAGES;
  const rail = useRef<HTMLDivElement>(null);
   const currentIdx = list.findIndex((s) => s.key === currentKey);
   useEffect(() => {
     const container = rail.current;
     const current = container?.querySelector<HTMLElement>('[aria-current="step"]');
     if (container && current) container.scrollLeft = Math.max(0, current.offsetLeft - container.clientWidth / 2 + current.clientWidth / 2);
   }, [currentKey, list.length]);
   if (currentIdx < 0) {
     return (
       <div className="card border-amber-900 bg-amber-950/30 p-3 text-sm text-amber-200">
         Current stage is not enabled in this tenant: {stageLabel(currentKey)}
       </div>
     );
   }
   const next = list[currentIdx + 1];
   const pct = list.length > 1 ? currentIdx / (list.length - 1) : 0;

   return (

    <div className="animate-rail-in">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-slate-200">
          Step {currentIdx + 1} of {list.length}
        </p>
        <p className="truncate text-xs text-slate-400">
          {next ? (
            <>Next: <span className="font-medium text-slate-200">{next.label}</span></>
          ) : (
            <span className="font-medium text-emerald-300">Journey complete</span>
          )}
        </p>
      </div>

      <div ref={rail} className="rail-scroll overflow-x-auto pb-3 pt-1" role="img" aria-label={`Stage ${currentIdx + 1} of ${list.length}: ${stageLabel(currentKey)}`}>
        <div className="relative px-1" style={{ minWidth: `${list.length * 88}px` }}>
          <div className="absolute left-2 right-2 top-[9px] h-0.5 rounded-full bg-ink-600/70" aria-hidden />
          <div
             className="absolute left-2 top-[9px] h-0.5 rounded-full bg-accent"
            style={{ width: `calc(${pct * 100}% - ${pct * 16}px)` }}
            aria-hidden
          />
          <ol className="relative flex justify-between">
            {list.map((s, i) => {
              const done = i < currentIdx;
              const current = i === currentIdx;
              const phase = stagePhase(s.key);
              return (
                <li key={s.key} aria-current={current ? 'step' : undefined} className="flex w-20 flex-col items-center gap-2" title={s.label}>
                  {done ? (
                     <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
                      <svg viewBox="0 0 12 12" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                        <path d="M2.5 6.2 5 8.5 9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  ) : current ? (
                    <span className="relative flex h-5 w-5 items-center justify-center">
                      <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/40" aria-hidden />
                       <span className="relative h-5 w-5 rounded-full border-[3px] border-amber-400 bg-ink-950" aria-hidden />
                    </span>
                  ) : (
                    <span className="h-5 w-5 rounded-full border-2 border-ink-600 bg-ink-900" aria-hidden />
                  )}
                  <span
                    className={`max-w-[80px] text-center text-[11px] leading-snug ${
                      current ? 'font-semibold text-slate-100' : done ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    {s.label}
                  </span>
                  <span className="sr-only">{`${s.label} (${phase})`}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
