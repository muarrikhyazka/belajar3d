package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
)

type App struct {
	DB        *pgxpool.Pool
	JWTSecret []byte
}

func main() {
	ctx := context.Background()
	dbURL := mustEnv("DATABASE_URL")
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()

	schema, err := os.ReadFile("schema.sql")
	if err != nil {
		log.Fatalf("read schema: %v", err)
	}
	if _, err := pool.Exec(ctx, string(schema)); err != nil {
		log.Fatalf("apply schema: %v", err)
	}

	app := &App{DB: pool, JWTSecret: []byte(mustEnv("JWT_SECRET"))}
	app.ensureTeacherSeed(ctx)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: false,
	}))

	r.Route("/api", func(api chi.Router) {
		RegisterAuthRoutes(api, app)
		RegisterSubjectRoutes(api, app)
		RegisterStudentRoutes(api, app)
		api.Get("/ping", func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		})
	})

	port := envOr("PORT", "5020")
	spaHandler(r, "./static")
	log.Printf("belajar3d backend listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

// spaHandler serves the built frontend (Vite dist) and falls back to
// index.html for any non-/api path so client-side routing works.
func spaHandler(r chi.Router, dir string) {
	fs := http.FileServer(http.Dir(dir))
	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		path := dir + req.URL.Path
		if _, err := os.Stat(path); err != nil {
			http.ServeFile(w, req, dir+"/index.html")
			return
		}
		fs.ServeHTTP(w, req)
	})
}

func mustEnv(k string) string {
	v := os.Getenv(k)
	if v == "" {
		log.Fatalf("missing required env %s", k)
	}
	return v
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
