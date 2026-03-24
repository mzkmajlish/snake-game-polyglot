// Snake Game — Go
// Terminal-based using tcell.
// Run: go run snake.go

package main

import (
	"fmt"
	"math/rand"
	"os"
	"time"

	"github.com/gdamore/tcell/v2"
)

const (
	width  = 30
	height = 20
)

type vec2 struct{ x, y int }

type game struct {
	snake []vec2
	dir   vec2
	food  vec2
	score int
	alive bool
}

func newGame() *game {
	mx, my := width/2, height/2
	g := &game{
		snake: []vec2{{mx, my}, {mx - 1, my}, {mx - 2, my}},
		dir:   vec2{1, 0},
		score: 0,
		alive: true,
	}
	g.placeFood()
	return g
}

func (g *game) placeFood() {
	occupied := make(map[vec2]bool, len(g.snake))
	for _, s := range g.snake {
		occupied[s] = true
	}
	for {
		pos := vec2{rand.Intn(width), rand.Intn(height)}
		if !occupied[pos] {
			g.food = pos
			return
		}
	}
}

func (g *game) setDir(x, y int) {
	if x != -g.dir.x || y != -g.dir.y {
		g.dir = vec2{x, y}
	}
}

func (g *game) tick() {
	if !g.alive {
		return
	}

	head := vec2{g.snake[0].x + g.dir.x, g.snake[0].y + g.dir.y}

	if head.x < 0 || head.x >= width || head.y < 0 || head.y >= height {
		g.alive = false
		return
	}

	for _, s := range g.snake {
		if s == head {
			g.alive = false
			return
		}
	}

	g.snake = append([]vec2{head}, g.snake...)

	if head == g.food {
		g.score += 10
		g.placeFood()
	} else {
		g.snake = g.snake[:len(g.snake)-1]
	}
}

func drawStr(s tcell.Screen, x, y int, style tcell.Style, text string) {
	col := x
	for _, r := range text {
		s.SetContent(col, y, r, nil, style)
		col++
	}
}

func draw(scr tcell.Screen, g *game) {
	scr.Clear()
	w, h := scr.Size()
	ox := max(0, (w-width*2-2)/2)
	oy := max(0, (h-height-4)/2)

	scoreStyle := tcell.StyleDefault.Foreground(tcell.ColorYellow).Bold(true)
	drawStr(scr, ox, oy, scoreStyle, fmt.Sprintf(" SCORE: %d ", g.score))

	borderStyle := tcell.StyleDefault.Foreground(tcell.ColorTeal)
	bw := width*2 + 2

	// Top / bottom borders
	drawStr(scr, ox, oy+1, borderStyle, "+")
	for i := 1; i < bw-1; i++ {
		drawStr(scr, ox+i, oy+1, borderStyle, "-")
	}
	drawStr(scr, ox+bw-1, oy+1, borderStyle, "+")

	drawStr(scr, ox, oy+2+height, borderStyle, "+")
	for i := 1; i < bw-1; i++ {
		drawStr(scr, ox+i, oy+2+height, borderStyle, "-")
	}
	drawStr(scr, ox+bw-1, oy+2+height, borderStyle, "+")

	for row := 0; row < height; row++ {
		drawStr(scr, ox, oy+2+row, borderStyle, "|")
		drawStr(scr, ox+bw-1, oy+2+row, borderStyle, "|")
	}

	// Food
	foodStyle := tcell.StyleDefault.Foreground(tcell.ColorRed).Bold(true)
	drawStr(scr, ox+1+g.food.x*2, oy+2+g.food.y, foodStyle, "@@")

	// Snake
	for i, seg := range g.snake {
		sx := ox + 1 + seg.x*2
		sy := oy + 2 + seg.y
		if i == 0 {
			style := tcell.StyleDefault.Foreground(tcell.ColorGreen).Bold(true)
			drawStr(scr, sx, sy, style, "██")
		} else {
			style := tcell.StyleDefault.Foreground(tcell.ColorDarkGreen)
			drawStr(scr, sx, sy, style, "▓▓")
		}
	}

	// Game over
	if !g.alive {
		msg := fmt.Sprintf("  GAME OVER  Score: %d  'r'=restart 'q'=quit  ", g.score)
		goStyle := tcell.StyleDefault.
			Foreground(tcell.ColorBlack).
			Background(tcell.ColorWhite).
			Bold(true)
		drawStr(scr, ox+2, oy+2+height/2, goStyle, msg)
	}

	scr.Show()
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func main() {
	rand.New(rand.NewSource(time.Now().UnixNano()))

	scr, err := tcell.NewScreen()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if err := scr.Init(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer scr.Fini()

	g := newGame()
	ticker := time.NewTicker(110 * time.Millisecond)
	defer ticker.Stop()

	events := make(chan tcell.Event)
	go func() {
		for {
			events <- scr.PollEvent()
		}
	}()

	for {
		select {
		case ev := <-events:
			switch e := ev.(type) {
			case *tcell.EventKey:
				switch e.Key() {
				case tcell.KeyRune:
					switch e.Rune() {
					case 'q':
						return
					case 'r':
						if !g.alive {
							g = newGame()
						}
					case 'w':
						g.setDir(0, -1)
					case 'a':
						g.setDir(-1, 0)
					case 's':
						g.setDir(0, 1)
					case 'd':
						g.setDir(1, 0)
					}
				case tcell.KeyUp:
					g.setDir(0, -1)
				case tcell.KeyDown:
					g.setDir(0, 1)
				case tcell.KeyLeft:
					g.setDir(-1, 0)
				case tcell.KeyRight:
					g.setDir(1, 0)
				case tcell.KeyEscape:
					return
				}
			case *tcell.EventResize:
				scr.Sync()
			}
		case <-ticker.C:
			g.tick()
			draw(scr, g)
		}
	}
}
