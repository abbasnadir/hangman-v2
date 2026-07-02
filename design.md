# Hangman-v2 Design System 🎨

This document serves as the master reference for the new UI overhaul of the game. All future component development must adhere to these guidelines to ensure a consistent, fun, and highly interactive user experience.

## 1. Core Principles
- **Show, Don't Tell**: Use icons for actions rather than text wherever possible (e.g., a "back" arrow instead of the word "Back").
- **Juicy Feedback**: Every interaction (hover, click, correct guess, wrong guess) must have a visual or physical response (scaling, bouncing, shaking).
- **Vibrant & Accessible**: Colors must pop, but maintain high contrast against dark backgrounds.

## 2. Technology Stack
- **Animations**: `framer-motion` (for bouncy, physics-based UI transitions and micro-interactions).
- **Icons**: `lucide-react` (clean, consistent, non-emoji vector icons).
- **UI Base**: `shadcn/ui` (Radix primitives for accessible modals, dropdowns, and tooltips, fully styled with Tailwind).

## 3. Typography
We use exactly two fonts to maintain consistency while injecting a playful vibe:
1. **Primary Font (Headings, Logos, Big Words)**: `Fredoka` (Rounded, thick, and incredibly fun).
2. **Secondary Font (Paragraphs, Timers, Menus)**: `Quicksand` (Clean, highly legible, but softly rounded to match the primary font).

## 4. Color Theory & Palette
Based on a **Split-Complementary** color scheme to create high contrast and vibrant energy:
- **Background Base**: Deep Space Blue (`#171124`) - Gives a premium "midnight" arcade feel.
- **Surface Panels**: Dark Indigo (`#251A3D`) - Used for cards and modals.
- **Primary Accent**: Electric Violet (`#8B5CF6`) - Used for active buttons and focus states.
- **Secondary Accent**: Sunny Amber (`#F59E0B`) - Used for highlights, coins, or "New" badges.
- **Correct/Win (Success)**: Neon Mint (`#10B981`)
- **Wrong/Loss (Danger)**: Bright Watermelon (`#F43F5E`)

## 5. Animations
*Excessive but deliberate animation makes the game feel alive.*
- **Hover States**: Buttons should `scale: 1.05` and slightly brighten.
- **Click States**: Buttons should `scale: 0.95` (squish effect).
- **Letter Reveal (Correct)**: Pop up and flip (`rotateX`).
- **Letter Reveal (Wrong)**: Vibrate/shake left and right (`x: [-5, 5, -5, 5, 0]`).
- **Page Transitions**: Slide in from the bottom with a slight fade and spring physics.

## 6. Components Inventory

### Layout & Containers
- `GameCard`: A rounded card (`rounded-3xl`) with a thick internal border (`border-t-white/10`) and a soft drop shadow. Used for modals and main game areas.
- `GlassOverlay`: A blurred backdrop (`backdrop-blur-md bg-black/40`) used behind modals or popup statuses.

### Game Specific
- `Keyboard`: 
  - A grid of square buttons sized appropriately for human hands and mobile devices.
  - State: **Unpressed** (Indigo), **Correct** (Neon Mint, disabled), **Wrong** (Watermelon, disabled).
  - Interaction: **DO NOT** use scaling, squishing, or shrinking animations that might cause misclicks or accessibility issues. Rely purely on the stark color changes to indicate which letters were right and which were wrong.
- `WordDisplay`:
  - The hidden word container. Letters sit in individual blocks with a heavy bottom border (like physical tiles).
  - Animations: Fast, snappy, non-intrusive flips or pops when a letter is revealed.
- `HealthBar`:
  - Replaces text. Uses heart icons (`lucide-react` Heart) that shatter or turn gray with a particle effect when a life is lost.
- `MatchBubble`:
  - Replaces table rows in the Match History. Expandable cards that reveal round details.

### Navigation & Actions
- `IconButton`: Circular buttons holding a single `lucide-react` icon. Used for Back, Settings, Profile.
- `PrimaryButton`: Large, pill-shaped buttons (`rounded-full`) with a subtle gradient background and heavy shadow. Used for "Start Game", "Next Round".
