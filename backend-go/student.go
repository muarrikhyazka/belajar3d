package main

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

// RegisterStudentRoutes: no auth - students play anonymously with a
// client-generated id + nickname, matching ZuperVerse's "tanpa akun" model.
func RegisterStudentRoutes(r chi.Router, app *App) {
	r.Post("/attempts", app.handleSubmitAttempt)
	r.Get("/progress/{clientID}", app.handleGetProgress)
	r.Get("/leaderboard", app.handleLeaderboard)
}

const xpPerCorrect = 10
const xpPerLevel = 100 // level = xp/100 + 1

func levelFor(xp int) int {
	return xp/xpPerLevel + 1
}

func (app *App) handleSubmitAttempt(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ClientID  string `json:"client_id"`
		Nickname  string `json:"nickname"`
		SubjectID int64  `json:"subject_id"`
		Score     int    `json:"score"`
		Total     int    `json:"total"`
	}
	if err := decodeJSON(r, &body); err != nil || body.ClientID == "" || body.Nickname == "" {
		jsonError(w, http.StatusBadRequest, "bad request")
		return
	}
	ctx := r.Context()
	xpEarned := body.Score * xpPerCorrect

	_, err := app.DB.Exec(ctx,
		"INSERT INTO student_attempts (client_id,nickname,subject_id,score,total,xp_earned) VALUES ($1,$2,$3,$4,$5,$6)",
		body.ClientID, body.Nickname, body.SubjectID, body.Score, body.Total, xpEarned)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var xp int
	err = app.DB.QueryRow(ctx, "SELECT xp FROM student_progress WHERE client_id=$1", body.ClientID).Scan(&xp)
	if err != nil {
		xp = xpEarned
		_, _ = app.DB.Exec(ctx,
			"INSERT INTO student_progress (client_id,nickname,xp,level) VALUES ($1,$2,$3,$4)",
			body.ClientID, body.Nickname, xp, levelFor(xp))
	} else {
		xp += xpEarned
		_, _ = app.DB.Exec(ctx,
			"UPDATE student_progress SET xp=$1, level=$2, nickname=$3, updated_at=now() WHERE client_id=$4",
			xp, levelFor(xp), body.Nickname, body.ClientID)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true, "xp_earned": xpEarned, "total_xp": xp, "level": levelFor(xp),
	})
}

func (app *App) handleGetProgress(w http.ResponseWriter, r *http.Request) {
	clientID := chi.URLParam(r, "clientID")
	var nickname string
	var xp, level int
	err := app.DB.QueryRow(r.Context(), "SELECT nickname,xp,level FROM student_progress WHERE client_id=$1", clientID).
		Scan(&nickname, &xp, &level)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "xp": 0, "level": 1, "nickname": ""})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "xp": xp, "level": level, "nickname": nickname})
}

func (app *App) handleLeaderboard(w http.ResponseWriter, r *http.Request) {
	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil {
			limit = n
		}
	}
	rows, err := app.DB.Query(r.Context(),
		"SELECT nickname,xp,level FROM student_progress ORDER BY xp DESC LIMIT $1", limit)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	type entry struct {
		Nickname string `json:"nickname"`
		XP       int    `json:"xp"`
		Level    int    `json:"level"`
	}
	var out []entry
	for rows.Next() {
		var e entry
		if err := rows.Scan(&e.Nickname, &e.XP, &e.Level); err != nil {
			jsonError(w, http.StatusInternalServerError, err.Error())
			return
		}
		out = append(out, e)
	}
	writeJSON(w, http.StatusOK, out)
}
