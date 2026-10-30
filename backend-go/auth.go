package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const cookieName = "belajar3d_session"

func RegisterAuthRoutes(r chi.Router, app *App) {
	r.Post("/login", app.handleLogin)
	r.Post("/logout", app.handleLogout)
	r.Get("/me", app.handleMe)
}

// ensureTeacherSeed creates the one teacher account from TEACHER_EMAIL /
// TEACHER_PASSWORD env vars if it doesn't exist yet. Single-user app (per
// scope) - no signup flow needed. ponytail: add real signup if this ever
// needs to support more than one teacher.
func (app *App) ensureTeacherSeed(ctx context.Context) {
	email := os.Getenv("TEACHER_EMAIL")
	pass := os.Getenv("TEACHER_PASSWORD")
	if email == "" || pass == "" {
		log.Println("TEACHER_EMAIL/TEACHER_PASSWORD not set, skipping seed (assuming teacher row already exists)")
		return
	}
	var count int
	_ = app.DB.QueryRow(ctx, "SELECT count(*) FROM teacher WHERE email=$1", email).Scan(&count)
	if count > 0 {
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(pass), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("hash seed password: %v", err)
	}
	_, err = app.DB.Exec(ctx, "INSERT INTO teacher (email, password_hash) VALUES ($1,$2)", email, string(hash))
	if err != nil {
		log.Fatalf("seed teacher: %v", err)
	}
	log.Printf("seeded teacher account: %s", email)
}

func (app *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct{ Email, Password string }
	if err := decodeJSON(r, &body); err != nil {
		jsonError(w, http.StatusBadRequest, "bad request")
		return
	}
	var id int64
	var hash, name string
	err := app.DB.QueryRow(r.Context(), "SELECT id, password_hash, display_name FROM teacher WHERE email=$1", body.Email).
		Scan(&id, &hash, &name)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Password)) != nil {
		jsonError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	token, err := app.signToken(id)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "token error")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: token, Path: "/", HttpOnly: true,
		Secure: true, SameSite: http.SameSiteLaxMode, MaxAge: 60 * 60 * 24 * 30,
	})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "display_name": name})
}

func (app *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", MaxAge: -1})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (app *App) handleMe(w http.ResponseWriter, r *http.Request) {
	id, ok := app.teacherID(r)
	if !ok {
		jsonError(w, http.StatusUnauthorized, "not logged in")
		return
	}
	var name string
	_ = app.DB.QueryRow(r.Context(), "SELECT display_name FROM teacher WHERE id=$1", id).Scan(&name)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "display_name": name})
}

func (app *App) signToken(teacherID int64) (string, error) {
	claims := jwt.MapClaims{"tid": teacherID, "exp": time.Now().Add(30 * 24 * time.Hour).Unix()}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString(app.JWTSecret)
}

// teacherID extracts + verifies the session cookie, returns (id, ok).
func (app *App) teacherID(r *http.Request) (int64, bool) {
	c, err := r.Cookie(cookieName)
	if err != nil {
		return 0, false
	}
	tok, err := jwt.Parse(c.Value, func(t *jwt.Token) (any, error) { return app.JWTSecret, nil })
	if err != nil || !tok.Valid {
		return 0, false
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return 0, false
	}
	idF, ok := claims["tid"].(float64)
	if !ok {
		return 0, false
	}
	return int64(idF), true
}

// requireTeacher is the auth guard for every teacher-only endpoint.
func (app *App) requireTeacher(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, ok := app.teacherID(r)
	if !ok {
		jsonError(w, http.StatusUnauthorized, "login required")
		return 0, false
	}
	return id, true
}
