'use client';

import { motion } from 'framer-motion';

/**
 * Classic hangman drawing, rendered as SVG and built up one step at a time.
 *
 * `progress` goes from 0 (nothing drawn) to 1 (complete figure). Modes map it to
 * whatever "losing" means for them: lives lost / total lives in Classic and
 * Multiplayer, time used / time limit in Countdown. The 10 steps are spread evenly
 * over that range, so with the default 5 lives each lost life adds two parts.
 */

type Part =
  | { kind: 'path'; d: string }
  | { kind: 'circle'; cx: number; cy: number; r: number };

const GALLOWS_STEPS: Part[][] = [
  [{ kind: 'path', d: 'M 18 206 H 122' }],                          // base
  [{ kind: 'path', d: 'M 48 206 V 18' }],                           // pole
  [{ kind: 'path', d: 'M 48 18 H 142' }, { kind: 'path', d: 'M 48 54 L 84 18' }], // beam + brace
  [{ kind: 'path', d: 'M 142 18 V 44' }],                           // rope
];
/** Index of the rope step; it hangs from the pivot and swings with the body. */
const ROPE_STEP = 3;

const FIGURE_STEPS: Part[][] = [
  [{ kind: 'circle', cx: 142, cy: 61, r: 17 }],                     // head
  [{ kind: 'path', d: 'M 142 78 V 134' }],                          // body
  [{ kind: 'path', d: 'M 142 94 L 117 119' }],                      // left arm
  [{ kind: 'path', d: 'M 142 94 L 167 119' }],                      // right arm
  [{ kind: 'path', d: 'M 142 134 L 120 170' }],                     // left leg
  [{ kind: 'path', d: 'M 142 134 L 164 170' }],                     // right leg
];

export const HANGMAN_TOTAL_STEPS = GALLOWS_STEPS.length + FIGURE_STEPS.length;

/** Number of parts to draw for a given progress (any loss shows at least one part). */
export const stepsForProgress = (progress: number) => {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return p >= 1 ? HANGMAN_TOTAL_STEPS : Math.ceil(p * HANGMAN_TOTAL_STEPS);
};

const GALLOWS_COLOR = '#A78BFA';
const FIGURE_COLOR = '#F4F4F5';
const DEAD_COLOR = '#F43F5E';

const PartShape = ({ part, color, animate, delay = 0 }: { part: Part; color: string; animate: boolean; delay?: number }) => {
  const common = {
    stroke: color,
    strokeWidth: 6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
    initial: animate ? { pathLength: 0, opacity: 0.2 } : false,
    animate: { pathLength: 1, opacity: 1, stroke: color },
    transition: { pathLength: { duration: 0.45, ease: 'easeOut' as const, delay }, opacity: { duration: 0.1, delay }, stroke: { duration: 0.3 } },
  };
  return part.kind === 'circle'
    ? <motion.circle cx={part.cx} cy={part.cy} r={part.r} {...common} />
    : <motion.path d={part.d} {...common} />;
};

const GhostShape = ({ part }: { part: Part }) => {
  const common = { stroke: '#FFFFFF', strokeOpacity: 0.07, strokeWidth: 5, strokeLinecap: 'round' as const, strokeDasharray: '2 9', fill: 'none' };
  return part.kind === 'circle'
    ? <circle cx={part.cx} cy={part.cy} r={part.r} {...common} />
    : <path d={part.d} {...common} />;
};

const Face = ({ dead }: { dead: boolean }) => (
  <motion.g
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 0.3 }}
    stroke={dead ? DEAD_COLOR : FIGURE_COLOR}
    strokeWidth={2.5}
    strokeLinecap="round"
    fill="none"
  >
    {dead ? (
      <>
        <path d="M 133 54 L 139 60 M 139 54 L 133 60" />
        <path d="M 145 54 L 151 60 M 151 54 L 145 60" />
        <path d="M 135 71 Q 142 65 149 71" />
      </>
    ) : (
      <>
        <circle cx={136} cy={57} r={1.2} fill={FIGURE_COLOR} />
        <circle cx={148} cy={57} r={1.2} fill={FIGURE_COLOR} />
        <path d="M 136 69 H 148" />
      </>
    )}
  </motion.g>
);

interface HangmanFigureProps {
  /** 0 = nothing drawn, 1 = complete figure. */
  progress: number;
  /** Force the "dead" look (e.g. the round was lost before every part was drawn). */
  dead?: boolean;
  className?: string;
}

export const HangmanFigure = ({ progress, dead: forceDead = false, className = '' }: HangmanFigureProps) => {
  const steps = forceDead ? HANGMAN_TOTAL_STEPS : stepsForProgress(progress);
  const dead = steps >= HANGMAN_TOTAL_STEPS;

  const gallowsShown = Math.min(steps, GALLOWS_STEPS.length);
  const figureShown = Math.max(0, steps - GALLOWS_STEPS.length);
  const figureColor = dead ? DEAD_COLOR : FIGURE_COLOR;

  return (
    <motion.svg
      key={steps}
      viewBox="0 0 190 220"
      role="img"
      aria-label={`Hangman: ${steps} of ${HANGMAN_TOTAL_STEPS} parts drawn`}
      className={`select-none overflow-visible ${className}`}
      initial={steps > 0 ? { x: 0 } : false}
      animate={steps > 0 ? { x: [-5, 5, -5, 5, 0] } : { x: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* Outline of everything still to come */}
      {[...GALLOWS_STEPS, ...FIGURE_STEPS].flat().map((part, i) => <GhostShape key={`ghost-${i}`} part={part} />)}

      {GALLOWS_STEPS.slice(0, Math.min(gallowsShown, ROPE_STEP)).map((step, i) =>
        step.map((part, j) => (
          <PartShape key={`g-${i}-${j}`} part={part} color={GALLOWS_COLOR} animate={i === steps - 1} delay={j * 0.2} />
        ))
      )}

      <g>
        {/* Once complete the body swings from the rope */}
        {dead && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            values="-4 142 18; 4 142 18; -4 142 18"
            keyTimes="0; 0.5; 1"
            calcMode="spline"
            keySplines="0.45 0 0.55 1; 0.45 0 0.55 1"
            dur="2.6s"
            repeatCount="indefinite"
          />
        )}
        {gallowsShown > ROPE_STEP && GALLOWS_STEPS[ROPE_STEP].map((part, j) => (
          <PartShape key={`rope-${j}`} part={part} color={GALLOWS_COLOR} animate={ROPE_STEP === steps - 1} />
        ))}
        {FIGURE_STEPS.slice(0, figureShown).map((step, i) =>
          step.map((part, j) => (
            <PartShape
              key={`f-${i}-${j}`}
              part={part}
              color={figureColor}
              animate={GALLOWS_STEPS.length + i === steps - 1}
            />
          ))
        )}
        {figureShown > 0 && <Face dead={dead} />}
      </g>
    </motion.svg>
  );
};

HangmanFigure.displayName = 'HangmanFigure';
