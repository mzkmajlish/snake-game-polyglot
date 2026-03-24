// Snake Game — Rust
// Terminal-based using crossterm.
// Run: cargo run

use crossterm::{
    cursor, event::{self, Event, KeyCode, KeyEvent},
    execute, queue,
    style::{self, Color, Stylize},
    terminal::{self, ClearType},
};
use std::{
    collections::VecDeque,
    io::{self, Write},
    time::Duration,
};

const WIDTH: i16 = 30;
const HEIGHT: i16 = 20;

#[derive(Clone, Copy, PartialEq)]
struct Vec2 { x: i16, y: i16 }

struct Game {
    snake: VecDeque<Vec2>,
    dir: Vec2,
    food: Vec2,
    score: u32,
    alive: bool,
    rng_state: u32,
}

impl Game {
    fn new() -> Self {
        let mx = WIDTH / 2;
        let my = HEIGHT / 2;
        let mut snake = VecDeque::new();
        snake.push_back(Vec2 { x: mx, y: my });
        snake.push_back(Vec2 { x: mx - 1, y: my });
        snake.push_back(Vec2 { x: mx - 2, y: my });

        let mut g = Game {
            snake,
            dir: Vec2 { x: 1, y: 0 },
            food: Vec2 { x: 0, y: 0 },
            score: 0,
            alive: true,
            rng_state: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .subsec_nanos(),
        };
        g.place_food();
        g
    }

    fn rand(&mut self) -> u32 {
        self.rng_state ^= self.rng_state << 13;
        self.rng_state ^= self.rng_state >> 17;
        self.rng_state ^= self.rng_state << 5;
        self.rng_state
    }

    fn place_food(&mut self) {
        loop {
            let pos = Vec2 {
                x: (self.rand() % WIDTH as u32) as i16,
                y: (self.rand() % HEIGHT as u32) as i16,
            };
            if !self.snake.iter().any(|s| *s == pos) {
                self.food = pos;
                return;
            }
        }
    }

    fn set_dir(&mut self, x: i16, y: i16) {
        if x != -self.dir.x || y != -self.dir.y {
            self.dir = Vec2 { x, y };
        }
    }

    fn tick(&mut self) {
        if !self.alive { return; }

        let head = Vec2 {
            x: self.snake[0].x + self.dir.x,
            y: self.snake[0].y + self.dir.y,
        };

        if head.x < 0 || head.x >= WIDTH || head.y < 0 || head.y >= HEIGHT {
            self.alive = false;
            return;
        }

        if self.snake.iter().any(|s| *s == head) {
            self.alive = false;
            return;
        }

        self.snake.push_front(head);

        if head == self.food {
            self.score += 10;
            self.place_food();
        } else {
            self.snake.pop_back();
        }
    }
}

fn draw(stdout: &mut io::Stdout, game: &Game) -> io::Result<()> {
    let (tw, th) = terminal::size()?;
    let ox = (tw as i16 - WIDTH * 2 - 2).max(0) / 2;
    let oy = (th as i16 - HEIGHT - 4).max(0) / 2;

    queue!(stdout, cursor::MoveTo(ox as u16, oy as u16))?;
    write!(stdout, "{}", format!(" SCORE: {} ", game.score).yellow().bold())?;

    // Border
    let bw = (WIDTH * 2 + 2) as usize;
    queue!(stdout, cursor::MoveTo(ox as u16, (oy + 1) as u16))?;
    write!(stdout, "{}", format!("+{}+", "-".repeat(bw - 2)).cyan())?;
    for row in 0..HEIGHT {
        queue!(stdout, cursor::MoveTo(ox as u16, (oy + 2 + row) as u16))?;
        write!(stdout, "{}", "|".cyan())?;
        queue!(stdout, cursor::MoveTo((ox + WIDTH * 2 + 1) as u16, (oy + 2 + row) as u16))?;
        write!(stdout, "{}", "|".cyan())?;
    }
    queue!(stdout, cursor::MoveTo(ox as u16, (oy + 2 + HEIGHT) as u16))?;
    write!(stdout, "{}", format!("+{}+", "-".repeat(bw - 2)).cyan())?;

    // Food
    queue!(stdout, cursor::MoveTo(
        (ox + 1 + game.food.x * 2) as u16,
        (oy + 2 + game.food.y) as u16,
    ))?;
    write!(stdout, "{}", "@@".with(Color::Red).bold())?;

    // Snake
    for (i, seg) in game.snake.iter().enumerate() {
        queue!(stdout, cursor::MoveTo(
            (ox + 1 + seg.x * 2) as u16,
            (oy + 2 + seg.y) as u16,
        ))?;
        if i == 0 {
            write!(stdout, "{}", "██".with(Color::Green).bold())?;
        } else {
            write!(stdout, "{}", "▓▓".with(Color::DarkGreen))?;
        }
    }

    // Game over
    if !game.alive {
        let msg = format!("  GAME OVER  Score: {}  'r'=restart 'q'=quit  ", game.score);
        queue!(stdout, cursor::MoveTo(
            (ox + 2) as u16,
            (oy + 2 + HEIGHT / 2) as u16,
        ))?;
        write!(stdout, "{}", msg.on(Color::White).with(Color::Black).bold())?;
    }

    stdout.flush()
}

fn main() -> io::Result<()> {
    let mut stdout = io::stdout();
    terminal::enable_raw_mode()?;
    execute!(stdout, terminal::EnterAlternateScreen, cursor::Hide)?;

    let mut game = Game::new();

    loop {
        execute!(stdout, terminal::Clear(ClearType::All))?;
        draw(&mut stdout, &game)?;

        if event::poll(Duration::from_millis(110))? {
            if let Event::Key(KeyEvent { code, .. }) = event::read()? {
                match code {
                    KeyCode::Char('q') => break,
                    _ if !game.alive => {
                        if code == KeyCode::Char('r') {
                            game = Game::new();
                        }
                        continue;
                    }
                    KeyCode::Up    | KeyCode::Char('w') => game.set_dir(0, -1),
                    KeyCode::Down  | KeyCode::Char('s') => game.set_dir(0,  1),
                    KeyCode::Left  | KeyCode::Char('a') => game.set_dir(-1, 0),
                    KeyCode::Right | KeyCode::Char('d') => game.set_dir(1,  0),
                    _ => {}
                }
            }
        }

        game.tick();
    }

    execute!(stdout, terminal::LeaveAlternateScreen, cursor::Show)?;
    terminal::disable_raw_mode()?;
    Ok(())
}
