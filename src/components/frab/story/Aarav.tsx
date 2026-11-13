import { motion } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Aarav — the FRAB customer character, drawn from scratch in SVG.
 * Layered 2.5D look: ground shadow, jacket, neck, head with shading, hair,
 * a lime rim light (FRAB accent), expressive brows / eyes / mouth, and a phone.
 * Every expression is driven by `mood`; blinking and breathing are ambient.
 */
export type AaravMood = "calm" | "shocked" | "worried" | "hopeful";

const SKIN = "#B9805C";
const SKIN_SHADE = "#9C6847";
const SKIN_LIGHT = "#D09A74";
const HAIR = "#11130F";
const JACKET = "#2B3028";
const JACKET_DARK = "#1D211C";
const LIME = "#C7F000";

const MOUTH: Record<AaravMood, string> = {
  calm: "M146 209 Q160 213 174 209 Q160 215 146 209",
  shocked: "M151 209 Q160 203 169 209 Q160 226 151 209",
  worried: "M147 214 Q160 205 173 214 Q160 211 147 214",
  hopeful: "M145 207 Q160 218 175 207 Q160 212 145 207",
};

// inner brow ends: negative rotate on the left brow / positive on the right raises them.
const BROW: Record<AaravMood, { y: number; l: number; r: number }> = {
  calm: { y: 0, l: 0, r: 0 },
  shocked: { y: -7, l: -2, r: 2 },
  worried: { y: -3, l: -11, r: 11 },
  hopeful: { y: -2, l: -3, r: 3 },
};

const EYE_SCALE: Record<AaravMood, number> = { calm: 1, shocked: 1.22, worried: 0.94, hopeful: 1 };

export default function Aarav({
  mood,
  lookAtPhone = true,
  phoneLit = false,
  className = "",
}: {
  mood: AaravMood;
  lookAtPhone?: boolean;
  phoneLit?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const brow = BROW[mood];
  const look = lookAtPhone ? { x: 2.6, y: 2.4 } : { x: 0, y: 0.4 };
  const ease = { type: "spring" as const, stiffness: 140, damping: 18 };
  const blink = reduced
    ? { scaleY: 1 }
    : {
        scaleY: [1, 1, 0.08, 1, 1],
        transition: { duration: 4.6, times: [0, 0.88, 0.92, 0.96, 1], repeat: Infinity },
      };

  const eye = (cx: number) => (
    <motion.g
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
      animate={blink}
    >
      <motion.g
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        animate={{ scaleY: EYE_SCALE[mood] }}
        transition={ease}
      >
        <ellipse cx={cx} cy={172} rx={9.5} ry={5.6} fill="#F1EFE6" />
        <motion.g animate={look} transition={ease}>
          <circle cx={cx} cy={172} r={4.3} fill="#3A2418" />
          <circle cx={cx} cy={172} r={2.1} fill="#0A0B08" />
          <circle cx={cx + 1.3} cy={170.6} r={0.9} fill="#fff" opacity={0.9} />
        </motion.g>
        <path
          d={`M${cx - 10} 170 Q${cx} 164 ${cx + 10} 170`}
          stroke={SKIN_SHADE}
          strokeWidth={1.4}
          fill="none"
          strokeLinecap="round"
        />
      </motion.g>
    </motion.g>
  );

  return (
    <svg
      viewBox="0 0 320 420"
      role="img"
      aria-label={`Aarav, a bank customer, looking ${mood}`}
      className={className}
    >
      <defs>
        <radialGradient id="aa-face" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor={SKIN_LIGHT} />
          <stop offset="62%" stopColor={SKIN} />
          <stop offset="100%" stopColor={SKIN_SHADE} />
        </radialGradient>
        <linearGradient id="aa-jacket" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#363C31" />
          <stop offset="100%" stopColor={JACKET_DARK} />
        </linearGradient>
        <linearGradient id="aa-rim" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={LIME} stopOpacity="0.85" />
          <stop offset="55%" stopColor={LIME} stopOpacity="0" />
        </linearGradient>
        <radialGradient id="aa-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={LIME} stopOpacity="0.35" />
          <stop offset="100%" stopColor={LIME} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="aa-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E6F5A0" />
          <stop offset="100%" stopColor="#7F9A1C" />
        </linearGradient>
      </defs>

      {/* ground shadow + back glow */}
      <ellipse cx="160" cy="408" rx="112" ry="9" fill="#000" opacity="0.35" />
      <circle cx="160" cy="200" r="150" fill="url(#aa-glow)" />

      <motion.g
        animate={reduced ? { y: 0 } : { y: [0, -2.5, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* torso */}
        <path
          d="M64 420 L64 334 Q64 288 118 272 L202 272 Q256 288 256 334 L256 420 Z"
          fill="url(#aa-jacket)"
        />
        <path d="M64 334 Q64 288 118 272" stroke={LIME} strokeOpacity="0.75" strokeWidth="2" fill="none" />
        <path d="M137 272 L160 312 L183 272 Z" fill="#D8DBD2" />
        <path d="M160 312 L160 420" stroke="#0F120D" strokeWidth="2" opacity="0.7" />

        {/* neck */}
        <path d="M143 236 L143 276 Q160 292 177 276 L177 236 Z" fill={SKIN_SHADE} />
        <path d="M143 262 Q160 276 177 262 L177 276 Q160 292 143 276 Z" fill="#000" opacity="0.18" />

        {/* ears */}
        <ellipse cx="108" cy="180" rx="6.5" ry="11" fill={SKIN} />
        <ellipse cx="212" cy="180" rx="6.5" ry="11" fill={SKIN_SHADE} />

        {/* head */}
        <path
          d="M108 165 Q108 110 160 108 Q212 110 212 165 Q212 202 192 226 Q160 252 128 226 Q108 202 108 165 Z"
          fill="url(#aa-face)"
        />
        {/* light stubble shadow */}
        <path
          d="M122 200 Q160 258 198 200 Q196 228 160 244 Q124 228 122 200 Z"
          fill="#2A1A10"
          opacity="0.16"
        />
        {/* hair */}
        <path
          d="M105 164 Q98 96 160 90 Q226 94 215 164 Q211 134 190 126 Q160 117 130 127 Q109 135 105 164 Z"
          fill={HAIR}
        />
        <path d="M118 112 Q150 96 190 108" stroke="#3A4036" strokeWidth="2" fill="none" opacity="0.8" />
        {/* rim light on the left edge of the head */}
        <path
          d="M108 165 Q108 110 160 108 Q112 118 112 168 Q114 204 134 226 Q112 206 108 165 Z"
          fill="url(#aa-rim)"
        />

        {/* brows */}
        <motion.path
          d="M127 158 Q140 152 153 157"
          stroke={HAIR}
          strokeWidth="3.6"
          strokeLinecap="round"
          fill="none"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          animate={{ y: brow.y, rotate: brow.l }}
          transition={ease}
        />
        <motion.path
          d="M167 157 Q180 152 193 158"
          stroke={HAIR}
          strokeWidth="3.6"
          strokeLinecap="round"
          fill="none"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          animate={{ y: brow.y, rotate: brow.r }}
          transition={ease}
        />

        {eye(140)}
        {eye(180)}

        {/* nose */}
        <path
          d="M160 178 Q155 193 159 197 Q164 199 167 195"
          stroke={SKIN_SHADE}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />

        {/* mouth */}
        <motion.path
          animate={{ d: MOUTH[mood] }}
          initial={false}
          transition={ease}
          fill={mood === "shocked" ? "#3A1C18" : "#5A2E24"}
          stroke="#5A2E24"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />

        {/* phone arm */}
        <path
          d="M232 304 Q252 338 220 362"
          stroke={JACKET}
          strokeWidth="30"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M232 304 Q252 338 220 362" stroke={LIME} strokeOpacity="0.35" strokeWidth="1.5" fill="none" />

        {/* phone */}
        <g transform="rotate(-9 200 340)">
          <rect x="172" y="296" width="54" height="92" rx="9" fill="#0B0D09" stroke="#3A4036" strokeWidth="1.5" />
          <motion.rect
            x="176"
            y="301"
            width="46"
            height="82"
            rx="6"
            fill="url(#aa-screen)"
            initial={false}
            animate={{ opacity: phoneLit ? 1 : 0.18 }}
            transition={{ duration: 0.4 }}
          />
          {phoneLit ? (
            <g>
              <rect x="181" y="308" width="36" height="14" rx="3" fill="#11130F" opacity="0.85" />
              <rect x="184" y="312" width="18" height="2" rx="1" fill={LIME} />
              <rect x="184" y="316" width="28" height="2" rx="1" fill="#B0B6AA" />
            </g>
          ) : null}
        </g>
        {/* fingers over phone edge */}
        <ellipse cx="226" cy="366" rx="9" ry="11" fill={SKIN} transform="rotate(-18 226 366)" />
        <ellipse cx="170" cy="356" rx="5" ry="9" fill={SKIN_LIGHT} transform="rotate(8 170 356)" />
      </motion.g>
    </svg>
  );
}
