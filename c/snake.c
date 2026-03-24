/*
 * Snake Game — C (C99)
 * Terminal-based using ncurses.
 * Compile: gcc -o snake snake.c -lncurses
 * Run:     ./snake
 */

#include <ncurses.h>
#include <stdlib.h>
#include <time.h>

#define WIDTH  30
#define HEIGHT 20
#define MAX_LEN (WIDTH * HEIGHT)

typedef struct { int x, y; } Vec2;

typedef struct {
    Vec2 body[MAX_LEN];
    int  length;
    Vec2 dir;
    Vec2 food;
    int  score;
    int  alive;
} Game;

static void place_food(Game *g) {
    int occupied;
    do {
        g->food.x = rand() % WIDTH;
        g->food.y = rand() % HEIGHT;
        occupied = 0;
        for (int i = 0; i < g->length; i++) {
            if (g->body[i].x == g->food.x && g->body[i].y == g->food.y) {
                occupied = 1;
                break;
            }
        }
    } while (occupied);
}

static void init_game(Game *g) {
    g->length = 3;
    g->score  = 0;
    g->alive  = 1;
    g->dir    = (Vec2){1, 0};

    int mx = WIDTH / 2, my = HEIGHT / 2;
    g->body[0] = (Vec2){mx, my};
    g->body[1] = (Vec2){mx - 1, my};
    g->body[2] = (Vec2){mx - 2, my};

    place_food(g);
}

static void tick(Game *g) {
    if (!g->alive) return;

    Vec2 head = {
        g->body[0].x + g->dir.x,
        g->body[0].y + g->dir.y
    };

    /* Wall check */
    if (head.x < 0 || head.x >= WIDTH || head.y < 0 || head.y >= HEIGHT) {
        g->alive = 0;
        return;
    }

    /* Self check */
    for (int i = 0; i < g->length; i++) {
        if (g->body[i].x == head.x && g->body[i].y == head.y) {
            g->alive = 0;
            return;
        }
    }

    int ate = (head.x == g->food.x && head.y == g->food.y);

    /* Shift body */
    if (!ate) {
        for (int i = g->length - 1; i > 0; i--)
            g->body[i] = g->body[i - 1];
    } else {
        g->score += 10;
        for (int i = g->length; i > 0; i--)
            g->body[i] = g->body[i - 1];
        g->length++;
        place_food(g);
    }

    g->body[0] = head;
}

static void draw(const Game *g) {
    erase();
    int h, w;
    getmaxyx(stdscr, h, w);
    int ox = (w - WIDTH * 2 - 2) / 2;
    int oy = (h - HEIGHT - 4) / 2;
    if (ox < 0) ox = 0;
    if (oy < 0) oy = 0;

    /* Score */
    attron(COLOR_PAIR(4) | A_BOLD);
    mvprintw(oy, ox, " SCORE: %d ", g->score);
    attroff(COLOR_PAIR(4) | A_BOLD);

    /* Border */
    attron(COLOR_PAIR(3));
    mvaddch(oy + 1, ox, '+');
    mvaddch(oy + 1, ox + WIDTH * 2 + 1, '+');
    mvaddch(oy + HEIGHT + 2, ox, '+');
    mvaddch(oy + HEIGHT + 2, ox + WIDTH * 2 + 1, '+');
    for (int x = 1; x <= WIDTH * 2; x++) {
        mvaddch(oy + 1, ox + x, '-');
        mvaddch(oy + HEIGHT + 2, ox + x, '-');
    }
    for (int y = 0; y < HEIGHT; y++) {
        mvaddch(oy + 2 + y, ox, '|');
        mvaddch(oy + 2 + y, ox + WIDTH * 2 + 1, '|');
    }
    attroff(COLOR_PAIR(3));

    /* Food */
    attron(COLOR_PAIR(2) | A_BOLD);
    mvprintw(oy + 2 + g->food.y, ox + 1 + g->food.x * 2, "@@");
    attroff(COLOR_PAIR(2) | A_BOLD);

    /* Snake */
    for (int i = 0; i < g->length; i++) {
        attron(COLOR_PAIR(1) | (i == 0 ? A_BOLD : 0));
        mvprintw(oy + 2 + g->body[i].y, ox + 1 + g->body[i].x * 2,
                 i == 0 ? "##" : "oo");
        attroff(COLOR_PAIR(1) | (i == 0 ? A_BOLD : 0));
    }

    /* Game over */
    if (!g->alive) {
        attron(A_REVERSE | A_BOLD);
        mvprintw(oy + 2 + HEIGHT / 2, ox + 2,
                 "  GAME OVER  Score: %d  'r'=restart 'q'=quit  ", g->score);
        attroff(A_REVERSE | A_BOLD);
    }

    refresh();
}

int main(void) {
    srand((unsigned)time(NULL));

    initscr();
    cbreak();
    noecho();
    keypad(stdscr, TRUE);
    curs_set(0);
    timeout(110);
    start_color();
    use_default_colors();

    init_pair(1, COLOR_GREEN,  -1);
    init_pair(2, COLOR_RED,    -1);
    init_pair(3, COLOR_CYAN,   -1);
    init_pair(4, COLOR_YELLOW, -1);

    Game game;
    init_game(&game);

    while (1) {
        draw(&game);
        int ch = getch();

        if (ch == 'q') break;

        if (!game.alive) {
            if (ch == 'r') init_game(&game);
            continue;
        }

        switch (ch) {
            case KEY_UP:    case 'w': if (game.dir.y != 1)  game.dir = (Vec2){ 0, -1}; break;
            case KEY_DOWN:  case 's': if (game.dir.y != -1) game.dir = (Vec2){ 0,  1}; break;
            case KEY_LEFT:  case 'a': if (game.dir.x != 1)  game.dir = (Vec2){-1,  0}; break;
            case KEY_RIGHT: case 'd': if (game.dir.x != -1) game.dir = (Vec2){ 1,  0}; break;
        }

        tick(&game);
    }

    endwin();
    return 0;
}
