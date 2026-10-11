export function BuildingIllustration() {
  return <svg className="lx-building" viewBox="90 70 430 610" width="430" height="610" fill="none" aria-hidden="true">
    <path d="M45 605 300 700 565 575M95 630 350 510M175 660 430 540" stroke="#333" strokeWidth="1" />
    <path d="m110 580 235-100 160 63-235 105Z" fill="#101010" stroke="#555" />
    {Array.from({ length: 9 }, (_, i) => {
      const y = 554 - i * 48; const setback = i > 6 ? 24 : 0;
      return <g key={i} className="lx-floor" data-floor={i}>
        <path d={`M${150 + setback} ${y} 350 ${y - 80} ${470 - setback} ${y - 32} 270 ${y + 48}Z`} fill="#161616" stroke="#626262" strokeWidth="1" />
        <path d={`M${150 + setback} ${y} 270 ${y + 48} 270 ${y + 78} ${150 + setback} ${y + 30}Z`} fill="#0d0d0d" stroke="#414141" />
        <path d={`M270 ${y + 48} ${470 - setback} ${y - 32} ${470 - setback} ${y - 2} 270 ${y + 78}Z`} fill="#121212" stroke="#414141" />
        {(['open', 'scheduled', 'done'] as const).map((status, index) => <path key={status} className={`lx-light lx-light-${status}`}
          d={`M${158 + setback} ${y + 16} 270 ${y + 61} ${462 - setback} ${y - 16}`}
          stroke={['#89A9B0', '#C69753', i % 3 === 0 ? '#416C6F' : '#A6A78C'][index]} strokeWidth="5" />)}
        {[0, 1, 2, 3, 4].map(n => <path key={n} d={`M${293 + n * 32} ${y + 41 - n * 13}v25`} stroke="#171717" strokeWidth="4" />)}
      </g>;
    })}
  </svg>;
}
