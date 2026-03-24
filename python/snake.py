"""
Snake Game — Python 3
Terminal-based using curses library.
Run: python snake.py
"""

import curses
import random
from collections import deque
from enum import Enum


class Direction(Enum):
    UP = (0, -1)
    DOWN = (0, 1)
    LEFT = (-1, 0)
    RIGHT = (1, 0)


OPPOSITE = {
    Direction.UP: Direction.DOWN,
    Direction.DOWN: Direction.UP,
    Direction.LEFT: Direction.RIGHT,
    Direction.RIGHT: Direction.LEFT,
}


class SnakeGame:
    def __init__(self, width: int = 30, height: int = 20):
        self.width = width
        self.height = height
        self.score = 0
        self.alive = True
        self.direction = Direction.RIGHT

        mid_x, mid_y = width // 2, height // 2
        self.snake: deque[tuple[int, int]] = deque([
            (mid_x, mid_y),
            (mid_x - 1, mid_y),
            (mid_x - 2, mid_y),
        ])
        self.occupied: set[tuple[int, int]] = set(self.snake)
        self.food = self._place_food()

    def _place_food(self) -> tuple[int, int]:
        while True:
            pos = (random.randint(0, self.width - 1),
                   random.randint(0, self.height - 1))
            if pos not in self.occupied:
                return pos

    def change_direction(self, new_dir: Direction) -> None:
        if new_dir != OPPOSITE[self.direction]:
            self.direction = new_dir

    def tick(self) -> bool:
        if not self.alive:
            return False

        dx, dy = self.direction.value
        hx, hy = self.snake[0]
        head = (hx + dx, hy + dy)

        # Wall collision
        if not (0 <= head[0] < self.width and 0 <= head[1] < self.height):
            self.alive = False
            return False

        # Self collision
        if head in self.occupied:
            self.alive = False
            return False

        self.snake.appendleft(head)
        self.occupied.add(head)

        if head == self.food:
            self.score += 10
            self.food = self._place_food()
        else:
            tail = self.snake.pop()
            self.occupied.discard(tail)

        return True


def main(stdscr: curses.window) -> None:
    curses.curs_set(0)
    curses.start_color()
    curses.use_default_colors()
    curses.init_pair(1, curses.COLOR_GREEN, -1)   # snake
    curses.init_pair(2, curses.COLOR_RED, -1)      # food
    curses.init_pair(3, curses.COLOR_CYAN, -1)     # border
    curses.init_pair(4, curses.COLOR_YELLOW, -1)   # score

    game = SnakeGame()
    stdscr.timeout(110)

    key_map = {
        curses.KEY_UP: Direction.UP,       ord('w'): Direction.UP,
        curses.KEY_DOWN: Direction.DOWN,   ord('s'): Direction.DOWN,
        curses.KEY_LEFT: Direction.LEFT,   ord('a'): Direction.LEFT,
        curses.KEY_RIGHT: Direction.RIGHT, ord('d'): Direction.RIGHT,
    }

    while True:
        stdscr.erase()
        h, w = stdscr.getmaxyx()

        # Offset to center the board
        ox = max(0, (w - game.width * 2 - 2) // 2)
        oy = max(0, (h - game.height - 4) // 2)

        # Score
        score_text = f" SCORE: {game.score} "
        stdscr.addstr(oy, ox, score_text, curses.color_pair(4) | curses.A_BOLD)

        # Border
        border_w = game.width * 2 + 2
        stdscr.addstr(oy + 1, ox, "+" + "-" * (border_w - 2) + "+", curses.color_pair(3))
        for row in range(game.height):
            stdscr.addstr(oy + 2 + row, ox, "|", curses.color_pair(3))
            stdscr.addstr(oy + 2 + row, ox + border_w - 1, "|", curses.color_pair(3))
        stdscr.addstr(oy + 2 + game.height, ox, "+" + "-" * (border_w - 2) + "+", curses.color_pair(3))

        # Food
        fx, fy = game.food
        stdscr.addstr(oy + 2 + fy, ox + 1 + fx * 2, "@@", curses.color_pair(2) | curses.A_BOLD)

        # Snake
        for i, (sx, sy) in enumerate(game.snake):
            ch = "██" if i == 0 else "▓▓"
            stdscr.addstr(oy + 2 + sy, ox + 1 + sx * 2, ch, curses.color_pair(1))

        if not game.alive:
            msg = f"  GAME OVER — Score: {game.score}  Press 'r' to restart, 'q' to quit  "
            my = oy + 2 + game.height // 2
            mx = max(0, ox + (border_w - len(msg)) // 2)
            stdscr.addstr(my, mx, msg, curses.A_REVERSE | curses.A_BOLD)

        stdscr.refresh()

        key = stdscr.getch()

        if key == ord('q'):
            break
        if not game.alive:
            if key == ord('r'):
                game = SnakeGame()
            continue

        if key in key_map:
            game.change_direction(key_map[key])

        game.tick()


if __name__ == "__main__":
    curses.wrapper(main)
