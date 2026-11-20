/** A nave da Lúdica (quatro elipses e a estrela), redesenhada em vetor a partir da logo. */
export default function Nave({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 194 48" className={className} aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="2.6">
        <ellipse data-anel="4" cx="97" cy="24" rx="95.5" ry="22.6" />
        <ellipse data-anel="3" cx="97" cy="24" rx="71.5" ry="22.6" />
        <ellipse data-anel="2" cx="97" cy="24" rx="47.2" ry="22.6" />
        <ellipse data-anel="1" cx="97" cy="24" rx="22.8" ry="22.6" />
      </g>
      <g data-estrela="" stroke="currentColor" strokeWidth="2.6" strokeLinecap="butt">
        <line x1="97" y1="10" x2="97" y2="38" />
        <line x1="83" y1="24" x2="111" y2="24" />
        <line x1="87.1" y1="14.1" x2="106.9" y2="33.9" />
        <line x1="87.1" y1="33.9" x2="106.9" y2="14.1" />
      </g>
    </svg>
  );
}
