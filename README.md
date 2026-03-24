<div align="center">

# 🐍 Snake · Polyglot Edition

**One game. Five languages. Zero compromises.**

*A high-performance Snake game built across the full programming stack — from a browser-based PWA to systems-level code in C and Rust.*

[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](web/game.js)
[![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](python/snake.py)
[![C](https://img.shields.io/badge/C-A8B9CC?style=for-the-badge&logo=c&logoColor=black)](c/snake.c)
[![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white)](rust/src/main.rs)
[![Go](https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white)](go/snake.go)

[![Status](https://img.shields.io/badge/Status-Live-22c55e?style=flat-square)]()
[![PWA](https://img.shields.io/badge/PWA-Installable-5A0FC8?style=flat-square&logo=pwa)]()
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)]()
[![Play Now](https://img.shields.io/badge/▶_Play_Now-mzkmajlish.github.io-22c55e?style=flat-square)](https://mzkmajlish.github.io/snake-game-polyglot/)

</div>

---

## 🎯 Why Five Languages?

The point isn't the game — it's the range. Each implementation targets a different paradigm and runtime:

| Language | Paradigm | Why It's Here |
|---|---|---|
| **JavaScript** | Event-driven, browser runtime | Primary deliverable — Canvas 2D, PWA, 60fps |
| **Python** | High-level, interpreted | Rapid prototyping, clean syntax |
| **C** | Low-level, systems | Manual memory, ncurses, zero abstractions |
| **Rust** | Systems + memory safety | Modern alternative to C, no GC, safe concurrency |
| **Go** | Compiled, concurrent | Simple systems code, fast compile times |

Solving the same problem in five languages demonstrates adaptability — the ability to work at any level of the stack.

---

## 🌐 Web Version

The browser implementation is the flagship — built for performance, mobile, and installability.

### ✦ Features

- **Arcade Mode** — wall wrapping, three power-up types (speed boost, shield, score multiplier), and progressive obstacle spawning scaled to score
- **Classic Mode** — walls are lethal, no extras, pure execution
- **60 fps game loop** — `requestAnimationFrame` with fixed timestep and interpolated rendering
- **O(1) collision detection** — flat occupancy grid backed by `Int16Array`, no iteration
- **Zero-GC hot path** — snake body and particles use pre-allocated typed arrays
- **Input ring buffer** — no dropped direction inputs on fast keypresses
- **PWA** — installable to home screen, offline-capable via service worker
- **Mobile-ready** — swipe gesture recognition, touch d-pad, safe area insets, overscroll prevention
- **Persistent best score** — `localStorage`

### 🎮 Controls

| Action | Input |
|---|---|
| Move | `W` `A` `S` `D` or Arrow Keys |
| Pause / Resume | `Space` or `Escape` |
| Mobile | Swipe on canvas or tap the d-pad |

---

## 💻 Terminal Versions

All five implementations share the same core architecture:

```
init → place_food → loop { handle_input → update → render } → game_over
```

### Run Locally

```bash
# Python (requires Python 3)
python python/snake.py

# C (requires ncurses)
gcc -o snake c/snake.c -lncurses && ./snake

# Rust (requires cargo)
cd rust && cargo run

# Go (requires Go 1.18+)
cd go && go run snake.go
```

---

## 🏗 Architecture (Web)

```
State machine   MENU → PLAYING → PAUSED → DEAD
Game loop       rAF → accumulate Δt → tick at fixed interval → interpolated draw
Collision       occupancy grid (Int16Array, O(1) read/write)
Snake body      ring-buffer style via Int16Array (snkX / snkY)
Particles       pre-allocated pool, positions in Float32Array
Input           ring buffer, direction validated against current heading
Persistence     localStorage for best score across sessions
PWA             service worker (network-first), manifest, install prompt
```

---

## 📁 Project Structure

```
snake-game-polyglot/
│
├── index.html                  ← GitHub Pages entry (redirects to web/)
│
├── web/                        ← Browser version (primary)
│   ├── index.html
│   ├── style.css
│   ├── game.js                 ← Full game engine (~900 lines)
│   ├── manifest.json           ← PWA manifest
│   ├── sw.js                   ← Service worker
│   └── icon-192.png / icon-512.png
│
├── python/
│   └── snake.py                ← Terminal (curses)
│
├── c/
│   └── snake.c                 ← Terminal (ncurses)
│
├── rust/
│   ├── Cargo.toml
│   └── src/main.rs             ← Terminal (crossterm)
│
└── go/
    ├── go.mod
    └── snake.go                ← Terminal (tcell)
```

---

## 🚀 Deployment

Hosted on GitHub Pages, served from the `main` branch root.

To deploy updates:

```bash
git add .
git commit -m "your message"
git push origin main
```

GitHub Pages rebuilds automatically on every push. The game is live within ~60 seconds.

---

<div align="center">

MIT © Md Zihan Khan Majlish

</div>
