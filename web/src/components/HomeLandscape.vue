<template>
  <!-- Behind the top of Home: Alps on the right, pine forests, a meadow fading into the page.
       Kept faint on the left so the greeting stays easy to read. -->
  <div class="pointer-events-none absolute -top-4 left-[-2rem] right-[-2rem] h-[560px] overflow-hidden" aria-hidden="true">
    <svg class="absolute inset-0 h-full w-full" viewBox="0 0 1400 560" preserveAspectRatio="xMaxYMin slice">
      <defs>
        <linearGradient id="hl-far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe0f3" /><stop offset="1" stop-color="#e6f0fa" /></linearGradient>
        <linearGradient id="hl-mid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fbfe3" /><stop offset="1" stop-color="#cfe0f2" /></linearGradient>
        <linearGradient id="hl-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbefe2" /><stop offset="1" stop-color="#fbefe2" stop-opacity="0" /></linearGradient>
        <linearGradient id="hl-fadeleft" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e3f0fa" stop-opacity="0.85" /><stop offset="0.45" stop-color="#e3f0fa" stop-opacity="0" /></linearGradient>
      </defs>

      <!-- far range -->
      <path d="M380 330 L520 200 L600 250 L700 150 L800 240 L900 120 L1010 230 L1100 170 L1200 250 L1300 140 L1400 220 L1400 360 L380 360z" fill="url(#hl-far)" />
      <path d="M700 150 L676 176 L690 172 L700 184 L712 170 L724 176z M900 120 L874 150 L890 146 L900 160 L913 144 L928 150z M1300 140 L1276 166 L1290 162 L1300 174 L1312 160 L1326 166z" fill="#fff" />

      <!-- near range -->
      <path d="M560 380 L700 250 L780 300 L880 190 L990 300 L1080 240 L1180 320 L1260 260 L1400 330 L1400 420 L560 420z" fill="url(#hl-mid)" />
      <path d="M880 190 L852 222 L870 216 L880 232 L894 214 L912 222z M1080 240 L1060 262 L1072 258 L1080 270 L1090 258 L1102 262z" fill="#fff" />

      <!-- forests -->
      <g fill="#4e9d86">
        <path v-for="(x, i) in [980, 1010, 1040, 1068, 1100, 1130, 1160, 1192, 1224, 1256, 1288, 1320, 1352, 1384]" :key="`a${i}`" :d="`M${x} ${300 + (i % 3) * 8} l-16 46 h32z M${x} ${284 + (i % 3) * 8} l-12 34 h24z`" />
      </g>
      <g fill="#3a8a73">
        <path v-for="(x, i) in [600, 628, 652, 680]" :key="`b${i}`" :d="`M${x} ${352 + (i % 2) * 6} l-13 38 h26z M${x} ${340 + (i % 2) * 6} l-10 28 h20z`" />
      </g>

      <!-- meadow and the sandy ground -->
      <path d="M380 420 C560 360 760 372 940 352 C1120 334 1260 300 1400 306 L1400 560 L380 560z" fill="#b9e2c2" />
      <path d="M300 470 C520 420 760 432 980 410 C1160 392 1300 380 1400 384 L1400 560 L300 560z" fill="#d9efd9" />
      <path d="M0 500 C300 452 620 470 900 452 C1100 440 1260 436 1400 440 L1400 560 L0 560z" fill="url(#hl-ground)" />
      <rect width="1400" height="560" fill="url(#hl-fadeleft)" />

      <!-- clouds drifting -->
      <g fill="#fff" opacity="0.9">
        <path d="M640 110 a16 16 0 0 1 5 -30 a20 20 0 0 1 38 -8 a17 17 0 0 1 30 10 a14 14 0 0 1 8 28z" style="animation: drift 40s ease-in-out infinite alternate" />
        <path d="M1150 70 a12 12 0 0 1 4 -23 a15 15 0 0 1 28 -6 a13 13 0 0 1 23 8 a11 11 0 0 1 6 21z" opacity="0.8" style="animation: drift 52s ease-in-out -14s infinite alternate" />
      </g>
    </svg>
    <!-- melt into the page below -->
    <div class="absolute inset-x-0 bottom-0 h-40" style="background: linear-gradient(180deg, rgb(244 249 253 / 0), #f4f9fd)" />
  </div>
</template>
