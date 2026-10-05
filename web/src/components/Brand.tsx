/** One public identity across marketing, authentication and onboarding. */
export default function Brand({ tagline = false }: { tagline?: boolean }) {
  return <span className="radbit-brand">
    <img className="radbit-brand-mark" src="/icons/radbit-auto-v2.svg" width="44" height="44" alt="" aria-hidden="true" />
    <span className="radbit-brand-type"><span className="radbit-brand-name">Radbit <span>Auto</span></span>
      {tagline && <small>Stock. Sales. Imports.</small>}
    </span>
  </span>;
}
